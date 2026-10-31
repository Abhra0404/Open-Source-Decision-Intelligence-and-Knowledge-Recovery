from collections.abc import Generator

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
