"""
agent_routes.py — Phase 3: Single-agent chat endpoint.

Safety rules enforced:
- Agent uses validated tools only (no direct DB access from this file)
- Delete requires confirmation; frontend handles the confirm dialog
- /confirm-delete executes the actual deletion after UI confirmation
"""
from fastapi import APIRouter
from pydantic import BaseModel

from .agents.single_agent import run_agent
from .agents.tools import tool_delete_employee

router = APIRouter(prefix="/api/agent", tags=["agent"])


class AgentChatRequest(BaseModel):
    message: str


class ConfirmDeleteRequest(BaseModel):
    employee_id: str


@router.post("/chat")
def agent_chat(payload: AgentChatRequest):
    """
    Phase 3: natural language in → agent runs a tool → structured result out.
    Response shape:
      {
        "response": str,
        "tool_called": str | null,
        "tool_result": dict | null,
        "pending_confirmation": { employee_id, name, message } | null
      }
    """
    return run_agent(payload.message)


@router.post("/confirm-delete")
def confirm_delete(payload: ConfirmDeleteRequest):
    """
    Execute a deletion that the agent flagged as pending confirmation.
    The frontend calls this only after the user clicks Confirm in the dialog.
    """
    return tool_delete_employee(payload.employee_id, confirmed=True)
