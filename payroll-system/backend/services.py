from decimal import Decimal


def calculate_net_salary(basic_salary: Decimal, bonus: Decimal, deduction: Decimal) -> Decimal:
    """
    KEY RULE: Net Salary = Basic Salary + Bonus - Deduction
    All payroll arithmetic is done exclusively here in Python backend code.
    The LLM must never compute this value.
    """
    return basic_salary + bonus - deduction
