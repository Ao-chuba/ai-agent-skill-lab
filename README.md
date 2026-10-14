# Employee Payroll System

Detailed GenAI, Single-Agent and Multi-Agent Case Study
**Stack:** HTML + CSS + JavaScript | FastAPI | MySQL | Validation | REST APIs

> **Instructions for the AI code editor:** Read this entire file, then build the project exactly as described. Build in the phases listed under "Build Order". Finish and test each phase before starting the next. Ask me before making any decision not covered here.


Team member - USN 26 27 28 29 30 
1DS24CS026 - Anvesha
1DS24CS027 - Aochuba 
1DS24CS028 - Aparna
1DS24CS029 - Arahan
1DS24CS030 - Arfa
---

## 1. Purpose

Build a payroll CRUD web application, then extend it with:
1. Conversational GenAI (explanations only)
2. Safe single-agent tool execution
3. Coordinated multi-agent workflows

## 2. Scope

Each employee record has:

| Field | Type | Notes |
|---|---|---|
| `employee_id` | string / int | Unique, primary key |
| `name` | string | Required |
| `basic_salary` | decimal | Required, >= 0 |
| `bonus` | decimal | Default 0, >= 0 |
| `deduction` | decimal | Default 0, >= 0 |
| `net_salary` | decimal | Calculated by backend |

Supported operations:
- Add employee
- List all employees
- Search employee (by ID and/or name)
- Update salary
- Calculate net salary
- Delete one employee
- Delete all employees

## 3. KEY RULE (non-negotiable)

```
Net Salary = Basic Salary + Bonus - Deduction
```

- **All payroll calculations are deterministic and done in backend code (Python).**
- The LLM must **never** be the source of truth for payroll arithmetic.
- The frontend may display a preview, but the backend value is the one stored and shown as final.
- If an LLM or agent is involved, it may only *call* the backend calculation endpoint or *explain* its result. It must never compute the number itself.

## 4. Learning Outcomes

- Create a responsive single-page web form and payroll grid with client-side validation.
- Build FastAPI endpoints with server-side validation, parameterized SQL and MySQL persistence.
- Distinguish GenAI explanations from Agentic AI actions and understand the boundaries of each.

---

## 5. Tech Stack

- **Frontend:** plain HTML, CSS, JavaScript (no framework), single page
- **Backend:** Python 3.10+, FastAPI, Uvicorn, Pydantic
- **Database:** MySQL (use `mysql-connector-python` or `PyMySQL`)
- **Config:** `.env` file for DB credentials (never hard-code them)

## 6. Project Structure

```
payroll-system/
├── README.md
├── requirements.txt
├── .env.example
├── schema.sql
├── backend/
│   ├── main.py            # FastAPI app, CORS, routers
│   ├── database.py        # MySQL connection helper
│   ├── models.py          # Pydantic schemas + validation
│   ├── services.py        # net salary calculation + business logic
│   ├── routes.py          # REST endpoints
│   └── agents/            # Phase 3 and 4 only
│       ├── tools.py
│       ├── single_agent.py
│       └── multi_agent.py
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

## 7. Database

`schema.sql`:

```sql
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
```

**Rules**
- Always use **parameterized queries** (`%s` placeholders). Never build SQL with string concatenation or f-strings.
- Use `Decimal`, not `float`, for money.

## 8. REST API

Base URL: `http://localhost:8000/api`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/employees` | Add an employee |
| GET | `/employees` | List all employees |
| GET | `/employees/search?q=...` | Search by ID or name |
| GET | `/employees/{id}` | Get one employee |
| PUT | `/employees/{id}/salary` | Update salary (basic, bonus, deduction) and recalculate net |
| GET | `/employees/{id}/net-salary` | Calculate and return net salary |
| DELETE | `/employees/{id}` | Delete one employee |
| DELETE | `/employees` | Delete all employees |

**Responses:** JSON. Use proper status codes: 200, 201, 400/422 (validation), 404 (not found), 409 (duplicate ID), 500.

### Server-side validation
- `employee_id`: required, non-empty, unique
- `name`: required, non-empty, letters/spaces only
- `basic_salary`, `bonus`, `deduction`: numeric, >= 0
- `deduction` must not exceed `basic_salary + bonus` (net salary must not be negative)
- Return clear error messages

## 9. Frontend

Single-page, responsive (works on mobile and desktop).

**Form:** Employee ID, Name, Basic Salary, Bonus, Deduction, Net Salary (read-only, auto-previewed).
**Buttons:** Add, Update Salary, Calculate Net, Clear.
**Grid/table:** lists all employees with columns for every field, plus a Delete button per row.
**Toolbar:** Search box, Delete All (with confirmation dialog).

### Client-side validation
- Required fields, numeric-only, no negative values
- Show inline error messages beneath each field
- Disable submit while invalid
- Validate on input and on submit; the server remains the final authority

Use `fetch()` for API calls. Show success/error toast messages. Refresh the grid after every change.

---

## 10. Build Order (phases)

### Phase 1: Core CRUD app (required)
1. Create the project structure, `requirements.txt`, `.env.example`, `schema.sql`.
2. Implement the backend (models, services, routes, DB layer).
3. Implement the frontend (form, grid, validation).
4. Test every endpoint and every UI action.

### Phase 2: GenAI conversational layer
Add a chat panel where the user asks questions such as *"Why is Ravi's net salary 48,000?"* or *"Explain how net salary is calculated."*
- Endpoint: `POST /api/ai/explain`
- The LLM **explains** using values already calculated and returned by the backend. It receives the employee record and the formula as context.
- The LLM must **not** compute, modify, add or delete anything.
- Show the explanation in the chat panel.

### Phase 3: Single-agent tool execution
Add one agent that can perform actions through a fixed set of **tools** that wrap the existing REST/service functions.
- Tools: `add_employee`, `list_employees`, `search_employee`, `update_salary`, `calculate_net_salary`, `delete_employee`
- Endpoint: `POST /api/agent/chat` (natural language in, action and result out)
- **Safety rules:**
  - Tools call backend functions; arithmetic is always done by backend code.
  - Validate all tool arguments with the same Pydantic models as the REST API.
  - Parameterized SQL only.
  - **Delete All is NOT exposed as a tool**, or requires explicit user confirmation.
  - Delete one requires confirmation.
  - Log every tool call (tool, arguments, result, timestamp).
  - Return a clear message when a request is outside the allowed tools.

### Phase 4: Multi-agent workflow
Coordinate several specialised agents, for example:
- **Orchestrator / Planner:** understands the request and routes to the right agent
- **Data Agent:** reads/searches/lists employees
- **Payroll Agent:** adds/updates records and triggers net salary calculation via backend
- **Validation Agent:** checks inputs and business rules before any write
- **Reporter Agent:** summarises results and explains them in plain language

Flow: User request, Orchestrator, Validation Agent, Payroll/Data Agent, Reporter Agent, response.
- Endpoint: `POST /api/multi-agent/chat`
- Same safety rules as Phase 3. The Payroll Agent still uses backend calculation only.
- Return the trace of which agent did what so it can be displayed in the UI.

### GenAI vs Agentic AI boundaries (document this in the UI/help text)
| | GenAI (Phase 2) | Agentic AI (Phases 3-4) |
|---|---|---|
| Role | Explains, answers | Takes actions via tools |
| Can change data? | No | Yes, only through validated tools |
| Does arithmetic? | Never | Never (backend does) |

## 11. Setup and Run

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
mysql -u root -p < schema.sql
cp .env.example .env              # fill in DB credentials and (Phase 2+) the LLM API key
uvicorn backend.main:app --reload --port 8000
```

Open `frontend/index.html` in the browser (or serve it via FastAPI static files).

`requirements.txt` (starting point): `fastapi`, `uvicorn`, `pydantic`, `mysql-connector-python`, `python-dotenv`

`.env.example`:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=payroll_db
LLM_API_KEY=your_key_here
```

## 12. Team Members

| USN / Roll No | Name |
|---|---|
| 26 | Anvesha |
| 27 | Aochuba |
| 28 | Aparna |
| 29 | Arahan |
| 30 | Arfa |

---

## 13. Acceptance Checklist

- [x] Can add, list, search, update salary, calculate net, delete one, delete all
- [x] Net salary = basic + bonus - deduction, calculated in backend only
- [x] Client-side and server-side validation both work
- [x] All SQL is parameterized; data persists in MySQL
- [x] Responsive UI on mobile and desktop
- [x] (Phase 2) AI explains but never calculates or changes data
- [x] (Phase 3) Single agent uses validated tools; destructive actions need confirmation
- [ ] (Phase 4) Multi-agent flow works with a visible trace

