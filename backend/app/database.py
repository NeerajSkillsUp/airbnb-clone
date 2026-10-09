import os

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("SQLITE_DATABASE_URL", "sqlite:///./airbnb.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def migrate_sqlite_ownership_columns(bind) -> None:
    if bind.dialect.name != "sqlite":
        return

    with bind.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS users ("
            "id INTEGER NOT NULL PRIMARY KEY, "
            "display_name VARCHAR(100) NOT NULL, "
            "role VARCHAR(20) NOT NULL)"
        )
        existing_tables = set(inspect(connection).get_table_names())
        for table_name, column_name, referenced_table in (
            ("listings", "host_id", "users"),
            ("bookings", "guest_id", "users"),
        ):
            if table_name not in existing_tables:
                continue
            columns = {
                column["name"]
                for column in inspect(connection).get_columns(table_name)
            }
            if column_name not in columns:
                connection.exec_driver_sql(
                    f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" '
                    f"INTEGER REFERENCES {referenced_table}(id)"
                )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
