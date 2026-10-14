"""
ai_routes.py — Phase 2: GenAI conversational explanation layer.

The LLM ONLY explains — it never computes, modifies, adds or deletes data.
Employee data is fetched from the DB first; the LLM receives it as context.
"""
import os
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai

from .database import get_connection

load_dotenv()
genai.configure(api_key=os.getenv("LLM_API_KEY", ""))

router = APIRouter(prefix="/api/ai", tags=["ai-explain"])


class ExplainRequest(BaseModel):
    question: str
    employee_id: Optional[str] = None


@router.post("/explain")
def explain(payload: ExplainRequest):
    """
    Phase 2 endpoint: answers questions by explaining backend-calculated data.
    The LLM receives the real employee record + formula as context.
    It must never compute salary values itself.
    """
    context_lines = [
        "PAYROLL FORMULA (computed by backend Python code, never by AI):",
        "  Net Salary = Basic Salary + Bonus − Deduction",
        "",
    ]

    # Fetch employee record if an ID was provided
    emp_data = None
    if payload.employee_id:
        try:
            conn = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT employee_id, name, basic_salary, bonus, deduction, net_salary "
                    "FROM employees WHERE employee_id = %s",
                    (payload.employee_id,),
                )
                row = cursor.fetchone()
                if row:
                    keys = ["employee_id", "name", "basic_salary", "bonus", "deduction", "net_salary"]
                    emp_data = dict(zip(keys, [str(v) for v in row]))
                    context_lines.append(f"Employee record (from database): {emp_data}")
            finally:
                conn.close()
        except Exception as db_err:
            context_lines.append(f"(Could not load employee data: {db_err})")

    context = "\n".join(context_lines)

    prompt = f"""You are PayrollPro Explain, a payroll assistant that ONLY explains concepts and data.

STRICT RULES:
- You must NEVER perform arithmetic or calculate any salary values yourself.
- You must NEVER add, edit, or delete any employee records.
- If asked to calculate something, explain the formula and reference the backend-calculated values provided.
- Refer to the provided employee data for specifics. Do not guess or assume numbers.

{context}

User question: {payload.question}

Provide a clear, friendly explanation."""

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        explanation = response.text
    except Exception as exc:
        explanation = f"Could not get AI explanation: {exc}"

    return {
        "question": payload.question,
        "explanation": explanation,
        "employee_data": emp_data,
        "note": "This AI only explains. All salary calculations are performed exclusively by the backend.",
    }
