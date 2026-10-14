from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from .database import get_connection
from .models import EmployeeCreate, EmployeeOut, SalaryUpdate
from .services import calculate_net_salary

router = APIRouter(prefix="/api/employees", tags=["employees"])


def _row_to_dict(row) -> dict:
    keys = ["employee_id", "name", "basic_salary", "bonus", "deduction", "net_salary"]
    return dict(zip(keys, row))


# ─── POST /api/employees ──────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=EmployeeOut)
def add_employee(payload: EmployeeCreate):
    net = calculate_net_salary(payload.basic_salary, payload.bonus, payload.deduction)
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Check duplicate
        cursor.execute(
            "SELECT employee_id FROM employees WHERE employee_id = %s",
            (payload.employee_id,),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail=f"Employee ID '{payload.employee_id}' already exists")

        cursor.execute(
            """INSERT INTO employees
               (employee_id, name, basic_salary, bonus, deduction, net_salary)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                payload.employee_id,
                payload.name,
                payload.basic_salary,
                payload.bonus,
                payload.deduction,
                net,
            ),
        )
        conn.commit()
        cursor.execute(
            "SELECT employee_id, name, basic_salary, bonus, deduction, net_salary FROM employees WHERE employee_id = %s",
            (payload.employee_id,),
        )
        return EmployeeOut(**_row_to_dict(cursor.fetchone()))
    finally:
        conn.close()


# ─── GET /api/employees ───────────────────────────────────────────────────────

@router.get("", response_model=List[EmployeeOut])
def list_employees():
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT employee_id, name, basic_salary, bonus, deduction, net_salary FROM employees ORDER BY employee_id"
        )
        return [EmployeeOut(**_row_to_dict(r)) for r in cursor.fetchall()]
    finally:
        conn.close()


# ─── GET /api/employees/search ────────────────────────────────────────────────

@router.get("/search", response_model=List[EmployeeOut])
def search_employees(q: str = Query(..., min_length=1)):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        like = f"%{q}%"
        cursor.execute(
            """SELECT employee_id, name, basic_salary, bonus, deduction, net_salary
               FROM employees
               WHERE employee_id LIKE %s OR name LIKE %s
               ORDER BY employee_id""",
            (like, like),
        )
        return [EmployeeOut(**_row_to_dict(r)) for r in cursor.fetchall()]
    finally:
        conn.close()


# ─── GET /api/employees/{id} ──────────────────────────────────────────────────

@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: str):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT employee_id, name, basic_salary, bonus, deduction, net_salary FROM employees WHERE employee_id = %s",
            (employee_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found")
        return EmployeeOut(**_row_to_dict(row))
    finally:
        conn.close()


# ─── PUT /api/employees/{id}/salary ──────────────────────────────────────────

@router.put("/{employee_id}/salary", response_model=EmployeeOut)
def update_salary(employee_id: str, payload: SalaryUpdate):
    net = calculate_net_salary(payload.basic_salary, payload.bonus, payload.deduction)
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT employee_id FROM employees WHERE employee_id = %s", (employee_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found")

        cursor.execute(
            """UPDATE employees
               SET basic_salary = %s, bonus = %s, deduction = %s, net_salary = %s
               WHERE employee_id = %s""",
            (payload.basic_salary, payload.bonus, payload.deduction, net, employee_id),
        )
        conn.commit()
        cursor.execute(
            "SELECT employee_id, name, basic_salary, bonus, deduction, net_salary FROM employees WHERE employee_id = %s",
            (employee_id,),
        )
        return EmployeeOut(**_row_to_dict(cursor.fetchone()))
    finally:
        conn.close()


# ─── GET /api/employees/{id}/net-salary ──────────────────────────────────────

@router.get("/{employee_id}/net-salary")
def get_net_salary(employee_id: str):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT basic_salary, bonus, deduction, net_salary FROM employees WHERE employee_id = %s",
            (employee_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found")
        basic, bonus, deduction, stored_net = row
        net = calculate_net_salary(Decimal(str(basic)), Decimal(str(bonus)), Decimal(str(deduction)))
        return {
            "employee_id": employee_id,
            "basic_salary": str(basic),
            "bonus": str(bonus),
            "deduction": str(deduction),
            "net_salary": str(net),
            "formula": "Net Salary = Basic Salary + Bonus - Deduction",
        }
    finally:
        conn.close()


# ─── DELETE /api/employees/{id} ───────────────────────────────────────────────

@router.delete("/{employee_id}", status_code=200)
def delete_employee(employee_id: str):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT employee_id FROM employees WHERE employee_id = %s", (employee_id,)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found")
        cursor.execute("DELETE FROM employees WHERE employee_id = %s", (employee_id,))
        conn.commit()
        return {"message": f"Employee '{employee_id}' deleted successfully"}
    finally:
        conn.close()


# ─── DELETE /api/employees ────────────────────────────────────────────────────

@router.delete("", status_code=200)
def delete_all_employees():
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM employees")
        conn.commit()
        return {"message": "All employees deleted successfully"}
    finally:
        conn.close()
