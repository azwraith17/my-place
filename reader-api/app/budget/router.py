from fastapi import APIRouter, HTTPException

from ..auth import Auth
from .models import Transaction, TransactionCreate
from .service import list_transactions, create_transaction, delete_transaction

router = APIRouter(prefix="/api/budget", tags=["budget"])


@router.get("/transactions", response_model=list[Transaction])
async def get_transactions(month: str | None = None, _: None = Auth):
    return await list_transactions(month)


@router.post("/transactions", response_model=Transaction, status_code=201)
async def add_transaction(body: TransactionCreate, _: None = Auth):
    return await create_transaction(body)


@router.delete("/transactions/{txn_id}", status_code=204)
async def remove_transaction(txn_id: str, _: None = Auth):
    try:
        await delete_transaction(txn_id)
    except KeyError as e:
        raise HTTPException(404, detail=str(e))
