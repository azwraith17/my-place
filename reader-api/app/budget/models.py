from pydantic import BaseModel
from typing import Literal


class Transaction(BaseModel):
    id: str
    type: Literal["income", "expense"]
    amount: float
    category: str = ""
    description: str = ""
    date: str  # YYYY-MM-DD
    created_at: str  # ISO datetime


class TransactionCreate(BaseModel):
    id: str  # client-generated ULID
    type: Literal["income", "expense"]
    amount: float
    category: str = ""
    description: str = ""
    date: str  # YYYY-MM-DD


class BudgetStore(BaseModel):
    version: int = 1
    transactions: list[Transaction] = []
