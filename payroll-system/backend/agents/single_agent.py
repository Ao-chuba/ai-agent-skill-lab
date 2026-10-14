"""
single_agent.py — Phase 3: Single-agent tool execution via Gemini function calling.

Safety rules:
- Tools call backend functions; arithmetic is ALWAYS done by backend code (services.py)
- All tool arguments validated with same Pydantic models as the REST API (inside tools.py)
- Parameterized SQL only (enforced in tools.py / database layer)
- Delete All is NOT exposed as a tool
- Delete one requires confirmed=True — agent always asks first
- Every tool call logged (inside tools.py)
- Returns clear message when request is outside allowed tools
"""
import json
import os
from dotenv import load_dotenv
import google.generativeai as genai

from .tools import (
    tool_add_employee,
    tool_list_employees,
    tool_search_employee,
    tool_update_salary,
    tool_calculate_net_salary,
    tool_delete_employee,
)

load_dotenv()
genai.configure(api_key=os.getenv("LLM_API_KEY", ""))

# ─── Tool Declarations (sent to Gemini) ───────────────────────────────────────

TOOL_DECLARATIONS = [
    {
        "name": "add_employee",
        "description": "Add a new employee record to the payroll system.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "employee_id": {"type": "STRING", "description": "Unique employee ID (e.g. EMP001)"},
                "name": {"type": "STRING", "description": "Full name — letters and spaces only"},
                "basic_salary": {"type": "STRING", "description": "Basic salary as a string number (>= 0)"},
                "bonus": {"type": "STRING", "description": "Bonus as a string number (>= 0, default '0')"},
                "deduction": {"type": "STRING", "description": "Deduction as a string number (>= 0, default '0')"},
            },
            "required": ["employee_id", "name", "basic_salary"],
        },
    },
    {
        "name": "list_employees",
        "description": "Retrieve all employees from the payroll system.",
        "parameters": {"type": "OBJECT", "properties": {}, "required": []},
    },
    {
        "name": "search_employee",
        "description": "Search for employees by ID or name (partial match).",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "q": {"type": "STRING", "description": "Search query — employee ID or partial name"},
            },
            "required": ["q"],
        },
    },
    {
        "name": "update_salary",
        "description": "Update an employee's basic salary, bonus, and deduction. Net salary is recalculated by the backend — never by AI.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "employee_id": {"type": "STRING", "description": "Employee ID to update"},
                "basic_salary": {"type": "STRING", "description": "New basic salary as string"},
                "bonus": {"type": "STRING", "description": "New bonus as string (default '0')"},
                "deduction": {"type": "STRING", "description": "New deduction as string (default '0')"},
            },
            "required": ["employee_id", "basic_salary"],
        },
    },
    {
        "name": "calculate_net_salary",
        "description": "Get the net salary for an employee, computed by backend using: Net = Basic + Bonus - Deduction. Never compute this yourself.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "employee_id": {"type": "STRING", "description": "Employee ID"},
            },
            "required": ["employee_id"],
        },
    },
    {
        "name": "delete_employee",
        "description": (
            "Delete one employee from the system. "
            "IMPORTANT SAFETY RULE: Always call first with confirmed=false to show the user a confirmation prompt. "
            "Only call with confirmed=true after the user explicitly says yes/confirm/proceed."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "employee_id": {"type": "STRING", "description": "Employee ID to delete"},
                "confirmed": {
                    "type": "BOOLEAN",
                    "description": "false = ask for confirmation, true = execute deletion (only after user confirms)",
                },
            },
            "required": ["employee_id"],
        },
    },
]

SYSTEM_PROMPT = """You are PayrollPro Agent — an AI assistant that takes actions in the Employee Payroll System via a fixed set of tools.

STRICT SAFETY RULES YOU MUST FOLLOW:
1. NEVER compute net salary yourself. It is always calculated by the backend. Use the calculate_net_salary tool.
2. For DELETE: always call delete_employee with confirmed=false first. Only use confirmed=true after the user explicitly says "yes", "confirm", "proceed", or similar.
3. "Delete all employees" is NOT available. Politely refuse if asked.
4. All salary values must be non-negative numbers.
5. If asked to do something outside your tools, say: "I'm not able to do that — I can only perform: add, list, search, update salary, calculate net salary, and delete one employee."

Be concise and clear. After performing an action, briefly describe what was done and the key result.
"""

# ─── Tool Dispatch ────────────────────────────────────────────────────────────

TOOL_DISPATCH = {
    "add_employee": tool_add_employee,
    "list_employees": lambda **kw: tool_list_employees(),
    "search_employee": tool_search_employee,
    "update_salary": tool_update_salary,
    "calculate_net_salary": tool_calculate_net_salary,
    "delete_employee": tool_delete_employee,
}


# ─── Agent Runner ─────────────────────────────────────────────────────────────

def run_agent(user_message: str) -> dict:
    """
    Run the single agent with Gemini function calling.

    Returns:
        {
            "response": str,                   # agent's final text reply
            "tool_called": str | None,         # name of tool invoked
            "tool_result": dict | None,        # raw tool result
            "pending_confirmation": dict | None # set when delete needs user confirmation
        }
    """
    try:
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=SYSTEM_PROMPT,
            tools=[{"function_declarations": TOOL_DECLARATIONS}],
        )

        chat = model.start_chat()
        response = chat.send_message(user_message)

        tool_called = None
        tool_result = None
        pending_confirmation = None

        # ── Check for function call in response ──────────────────────────────
        for part in response.parts:
            if not hasattr(part, "function_call"):
                continue
            fc = part.function_call
            if not fc.name:
                continue

            tool_called = fc.name
            tool_args = dict(fc.args)

            if tool_called not in TOOL_DISPATCH:
                tool_result = {"status": "error", "message": f"Unknown tool: {tool_called}"}
            else:
                tool_result = TOOL_DISPATCH[tool_called](**tool_args)

            # ── Deletion needs confirmation — stop here, surface to UI ───────
            if tool_result.get("status") == "confirmation_required":
                pending_confirmation = {
                    "employee_id": tool_result["employee_id"],
                    "name": tool_result["name"],
                    "message": tool_result["message"],
                }
                return {
                    "response": tool_result["message"],
                    "tool_called": tool_called,
                    "tool_result": tool_result,
                    "pending_confirmation": pending_confirmation,
                }

            # ── Send tool result back to Gemini for a natural reply ──────────
            function_response_part = genai.protos.Part(
                function_response=genai.protos.FunctionResponse(
                    name=tool_called,
                    response={"result": json.dumps(tool_result, ensure_ascii=False)},
                )
            )
            final_response = chat.send_message(function_response_part)
            text = getattr(final_response, "text", str(final_response))

            return {
                "response": text,
                "tool_called": tool_called,
                "tool_result": tool_result,
                "pending_confirmation": None,
            }

        # ── No function call — pure text response (explanation / out-of-scope) ─
        text = getattr(response, "text", str(response))
        return {
            "response": text,
            "tool_called": None,
            "tool_result": None,
            "pending_confirmation": None,
        }

    except Exception as exc:
        return {
            "response": f"⚠️ Agent error: {exc}",
            "tool_called": None,
            "tool_result": None,
            "pending_confirmation": None,
        }
