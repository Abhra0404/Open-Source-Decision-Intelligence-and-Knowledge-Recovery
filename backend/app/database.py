from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import settings


def connection() -> psycopg.Connection:
    return psycopg.connect(settings.database_url, row_factory=dict_row)


def get_connection() -> Generator[psycopg.Connection, None, None]:
    with connection() as conn:
        yield conn


def lock_repository(conn: psycopg.Connection, repository_id: object) -> None:
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtext('metis:repository:' || %s::text))",
        (str(repository_id),),
    )


@contextmanager
def open_weight_model_lock(model_name: str, timeout_seconds: int = 30) -> Iterator[datetime]:
    lock_conn = connection()
    acquired = False
    try:
        lock_conn.execute(
            "SELECT set_config('lock_timeout', %s, false)",
            (f"{timeout_seconds * 1000}ms",),
        )
        lock_conn.execute(
            "SELECT pg_advisory_lock(hashtext('metis:open-weight:' || %s))",
            (model_name,),
        )
        lock_conn.commit()
        acquired = True
        with lock_conn.cursor() as cur:
            cur.execute("SELECT clock_timestamp() AS acquired_at")
            acquired_at = cur.fetchone()["acquired_at"]
        yield acquired_at
    finally:
        if acquired:
            try:
                lock_conn.execute(
                    "SELECT pg_advisory_unlock(hashtext('metis:open-weight:' || %s))",
                    (model_name,),
                )
                lock_conn.commit()
            finally:
                lock_conn.close()
        else:
            lock_conn.rollback()
            lock_conn.close()
