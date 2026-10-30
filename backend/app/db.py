from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from . import config


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    # No pre-ping: every checkout would cost a ~150 ms round trip to Supabase. Recycle instead.
    kwargs: dict = {"pool_recycle": 240, "pool_size": 5, "max_overflow": 5}
    if url.startswith("postgresql+psycopg"):
        # Supabase's transaction pooler (port 6543) can't keep server-side prepared statements
        kwargs["connect_args"] = {"prepare_threshold": None}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


if not config.DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in the root .env")

engine = make_engine(config.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
# Reads skip BEGIN/ROLLBACK: two fewer ~150 ms round trips per request. Same connection pool.
ReadSessionLocal = sessionmaker(bind=engine.execution_options(isolation_level="AUTOCOMMIT"), autoflush=False, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    db = (ReadSessionLocal if request.method == "GET" else SessionLocal)()
    try:
        yield db
    finally:
        db.close()


def warm_up(n: int = 3) -> None:
    """Open a few pooled connections at startup so the first requests don't pay the TLS handshake."""
    conns = [engine.connect() for _ in range(n)]
    for c in conns:
        c.exec_driver_sql("select 1")
        c.close()
