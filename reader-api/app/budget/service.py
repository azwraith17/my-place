import asyncio
from datetime import datetime, timezone

from ..storage import read_json, atomic_write_json
from ..config import settings
from .models import Transaction, TransactionCreate, BudgetStore

_lock = asyncio.Lock()


def _budget_path():
    return settings.data_path / "budget.json"


def _load_store() -> BudgetStore:
    path = _budget_path()
    if not path.exists():
        return BudgetStore()
    return BudgetStore(**read_json(path))


def _save_store(store: BudgetStore) -> None:
    atomic_write_json(_budget_path(), store.model_dump(mode="json"))


async def list_transactions(month: str | None = None) -> list[Transaction]:
    async with _lock:
        store = _load_store()
        if month:
            return [t for t in store.transactions if t.date.startswith(month)]
        return store.transactions


async def create_transaction(body: TransactionCreate) -> Transaction:
    async with _lock:
        store = _load_store()
        existing = next((t for t in store.transactions if t.id == body.id), None)
        if existing:
            return existing
        txn = Transaction(
            **body.model_dump(),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        store.transactions.append(txn)
        _save_store(store)
    return txn


async def delete_transaction(txn_id: str) -> None:
    async with _lock:
        store = _load_store()
        original = len(store.transactions)
        store.transactions = [t for t in store.transactions if t.id != txn_id]
        if len(store.transactions) == original:
            raise KeyError("Transaction not found")
        _save_store(store)
