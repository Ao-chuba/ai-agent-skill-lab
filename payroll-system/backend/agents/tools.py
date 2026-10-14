"""
tools.py — Phase 3 tool functions that wrap backend services.

Safety rules enforced here:
- All arithmetic is done by services.calculate_net_salary (never by LLM)
- All SQL uses parameterized queries only
- delete_employee requires confirmed=True; without it returns confirmation_required
- Delete All is NOT exposed as a tool
- Every tool call is logged to agent_log.jsonl
"""
import json
import os
from datetime import datetime, timezone
from decimal import Decimal

from ..database import get_connection
from ..models import EmployeeCreate, SalaryUpdate
from ..services import calculate_net_salary

LOG_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "agent_log.jsonl")
)


# ─── Logging ─────────────────────────────────────────────────────────────────

def _log(tool_name: str, arguments: dict, result: dict) -> None:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tool": tool_name,
        "arguments": {k: str(v) for k, v in arguments.items()},
        "result": result,
    }
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    keys = ["employee_id", "name", "basic_salary", "bonus", "deduction", "net_salary"]
    d = dict(zip(keys, row))
    for k in ["basic_salary", "bonus", "deduction", "net_salary"]:
        if k in d:
            d[k] = str(d[k])
    return d


# ─── Tools ───────────────────────────────────────────────────────────────────

def tool_add_employee(
    employee_id: str,
    name: str,
    basic_salary: str,
    bonus: str = "0",
    deduction: str = "0",
) -> dict:
    args = dict(employee_id=employee_id, name=name, basic_salary=basic_salary, bonus=bonus, deduction=deduction)
    try:
        payload = EmployeeCreate(
            employee_id=employee_id,
            name=name,
            basic_salary=Decimal(basic_salary),
            bonus=Decimal(bonus),
            deduction=Decimal(deduction),
        )
        net = calculate_net_salary(payload.basic_salary, payload.bonus, payload.deduction)
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT employee_id FROM employees WHERE employee_id = %s", (payload.employee_id,))
            if cursor.fetchone():
                result = {"status": "error", "message": f"Employee ID '{payload.employee_id}' already exists"}
                _log("add_employee", args, result)
                return result
            cursor.execute(
                "INSERT INTO employees (employee_id, name, basic_salary, bonus, deduction, net_salary) VALUES (%s, %s, %s, %s, %s, %s)",
                (payload.employee_id, payload.name, payload.basic_salary, payload.bonus, payload.deduction, net),
            )
            conn.commit()
            result = {
                "status": "success",
                "message": f"Employee '{payload.name}' (ID: {payload.employee_id}) added. Net salary: ₹{net}",
                "employee": {"employee_id": payload.employee_id, "name": payload.name, "net_salary": str(net)},
            }
        finally:
            conn.close()
    except Exception as e:
        result = {"status": "error", "message": str(e)}
    _log("add_employee", args, result)
    return result


def tool_list_employees() -> dict:
    try:
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT employee_id, name, basic_salary, bonus, deduction, net_salary FROM employees ORDER BY employee_id"
            )
            employees = [_row_to_dict(r) for r in cursor.fetchall()]
            result = {"status": "success", "count": len(employees), "employees": employees}
        finally:
            conn.close()
    except Exception as e:
        result = {"status": "error", "message": str(e)}
    _log("list_employees", {}, result)
    return result


def tool_search_employee(q: str) -> dict:
    try:
        conn = get_connection()
        try:
            cursor = conn.cursor()
            like = f"%{q}%"
            cursor.execute(
                "SELECT employee_id, name, basic_salary, bonus, deduction, net_salary "
                "FROM employees WHERE employee_id LIKE %s OR name LIKE %s ORDER BY employee_id",
                (like, like),
            )
            employees = [_row_to_dict(r) for r in cursor.fetchall()]
            result = {"status": "success", "count": len(employees), "employees": employees}
        finally:
            conn.close()
    except Exception as e:
        result = {"status": "error", "message": str(e)}
    _log("search_employee", {"q": q}, result)
    return result


def tool_update_salary(
    employee_id: str,
    basic_salary: str,
    bonus: str = "0",
    deduction: str = "0",
) -> dict:
    args = dict(employee_id=employee_id, basic_salary=basic_salary, bonus=bonus, deduction=deduction)
    try:
        payload = SalaryUpdate(
            basic_salary=Decimal(basic_salary),
            bonus=Decimal(bonus),
            deduction=Decimal(deduction),
        )
        # Net salary is ALWAYS calculated by backend code — never by LLM
        net = calculate_net_salary(payload.basic_salary, payload.bonus, payload.deduction)
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM employees WHERE employee_id = %s", (employee_id,))
            row = cursor.fetchone()
            if not row:
                result = {"status": "error", "message": f"Employee '{employee_id}' not found"}
                _log("update_salary", args, result)
                return result
            emp_name = row[0]
            cursor.execute(
                "UPDATE employees SET basic_salary=%s, bonus=%s, deduction=%s, net_salary=%s WHERE employee_id=%s",
                (payload.basic_salary, payload.bonus, payload.deduction, net, employee_id),
            )
            conn.commit()
            result = {
                "status": "success",
                "message": f"Salary updated for '{emp_name}' (ID: {employee_id}). New net salary: ₹{net}",
                "net_salary": str(net),
            }
        finally:
            conn.close()
    except Exception as e:
        result = {"status": "error", "message": str(e)}
    _log("update_salary", args, result)
    return result


def tool_calculate_net_salary(employee_id: str) -> dict:
    try:
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name, basic_salary, bonus, deduction FROM employees WHERE employee_id = %s",
                (employee_id,),
            )
            row = cursor.fetchone()
            if not row:
                result = {"status": "error", "message": f"Employee '{employee_id}' not found"}
                _log("calculate_net_salary", {"employee_id": employee_id}, result)
                return result
            name, basic, bonus, deduction = row
            # Arithmetic done by backend service — never by LLM
            net = calculate_net_salary(Decimal(str(basic)), Decimal(str(bonus)), Decimal(str(deduction)))
            result = {
                "status": "success",
                "employee_id": employee_id,
                "name": name,
                "basic_salary": str(basic),
                "bonus": str(bonus),
                "deduction": str(deduction),
                "net_salary": str(net),
                "formula": "Net Salary = Basic Salary + Bonus - Deduction (computed by backend)",
            }
        finally:
            conn.close()
    except Exception as e:
        result = {"status": "error", "message": str(e)}
    _log("calculate_net_salary", {"employee_id": employee_id}, result)
    return result


def tool_delete_employee(employee_id: str, confirmed: bool = False) -> dict:
    """
    Safety: confirmed=False returns a confirmation_required response.
    The agent must surface this to the user before proceeding with confirmed=True.
    Delete All is NOT available as a tool.
    """
    args = {"employee_id": employee_id, "confirmed": confirmed}

    # Always look up the employee first
    try:
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM employees WHERE employee_id = %s", (employee_id,))
            row = cursor.fetchone()
            if not row:
                result = {"status": "error", "message": f"Employee '{employee_id}' not found"}
                _log("delete_employee", args, result)
                return result
            emp_name = row[0]

            if not confirmed:
                # Require explicit user confirmation before deleting
                result = {
                    "status": "confirmation_required",
                    "employee_id": employee_id,
                    "name": emp_name,
                    "message": f"Are you sure you want to delete '{emp_name}' (ID: {employee_id})? This cannot be undone.",
                }
                _log("delete_employee", args, result)
                return result

            # confirmed=True — execute deletion
            cursor.execute("DELETE FROM employees WHERE employee_id = %s", (employee_id,))
            conn.commit()
            result = {
                "status": "success",
                "message": f"Employee '{emp_name}' (ID: {employee_id}) has been deleted.",
            }
        finally:
            conn.close()
    except Exception as e:
        result = {"status": "error", "message": str(e)}

    _log("delete_employee", args, result)
    return result
