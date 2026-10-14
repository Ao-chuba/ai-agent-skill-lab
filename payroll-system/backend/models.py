import re
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, field_validator, model_validator


class EmployeeCreate(BaseModel):
    employee_id: str
    name: str
    basic_salary: Decimal
    bonus: Decimal = Decimal("0")
    deduction: Decimal = Decimal("0")

    @field_validator("employee_id")
    @classmethod
    def validate_employee_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("employee_id must not be empty")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be empty")
        if not re.match(r"^[A-Za-z\s]+$", v):
            raise ValueError("name must contain letters and spaces only")
        return v

    @field_validator("basic_salary", "bonus", "deduction", mode="before")
    @classmethod
    def validate_non_negative(cls, v):
        val = Decimal(str(v))
        if val < 0:
            raise ValueError("Value must be >= 0")
        return val

    @model_validator(mode="after")
    def validate_net_not_negative(self):
        if self.deduction > self.basic_salary + self.bonus:
            raise ValueError(
                "deduction must not exceed basic_salary + bonus (net salary cannot be negative)"
            )
        return self


class SalaryUpdate(BaseModel):
    basic_salary: Decimal
    bonus: Decimal = Decimal("0")
    deduction: Decimal = Decimal("0")

    @field_validator("basic_salary", "bonus", "deduction", mode="before")
    @classmethod
    def validate_non_negative(cls, v):
        val = Decimal(str(v))
        if val < 0:
            raise ValueError("Value must be >= 0")
        return val

    @model_validator(mode="after")
    def validate_net_not_negative(self):
        if self.deduction > self.basic_salary + self.bonus:
            raise ValueError(
                "deduction must not exceed basic_salary + bonus (net salary cannot be negative)"
            )
        return self


class EmployeeOut(BaseModel):
    employee_id: str
    name: str
    basic_salary: Decimal
    bonus: Decimal
    deduction: Decimal
    net_salary: Decimal

    class Config:
        from_attributes = True
