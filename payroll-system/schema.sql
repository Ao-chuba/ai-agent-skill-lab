CREATE DATABASE IF NOT EXISTS payroll_db;
USE payroll_db;

CREATE TABLE IF NOT EXISTS employees (
    employee_id   VARCHAR(20)   PRIMARY KEY,
    name          VARCHAR(100)  NOT NULL,
    basic_salary  DECIMAL(12,2) NOT NULL CHECK (basic_salary >= 0),
    bonus         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (bonus >= 0),
    deduction     DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (deduction >= 0),
    net_salary    DECIMAL(12,2) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
