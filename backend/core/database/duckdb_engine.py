import os
import duckdb
import pandas as pd
import threading
import logging
from typing import Optional

logger = logging.getLogger("sdo.core.database.duckdb")

class DuckDBEngine:
    """
    Singleton connection manager for DuckDB analytics storage.
    Ensures thread-safe queries and updates using a global execution lock.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, db_path: str = "sutrix_analytics.duckdb"):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(DuckDBEngine, cls).__new__(cls)
                cls._instance._init_db(db_path)
            return cls._instance

    def _init_db(self, db_path: str):
        self.db_path = os.path.abspath(db_path)
        logger.info(f"Initializing DuckDB on-disk storage at: {self.db_path}")
        # Connect to DuckDB database file
        # Note: read_only=False to allow writes.
        self.conn = duckdb.connect(self.db_path, read_only=False)
        # Enable multi-threaded query execution
        self.conn.execute("SET threads TO 4;")

    def execute_query(self, query: str, params: tuple = None) -> duckdb.DuckDBPyConnection:
        """Executes a raw SQL query on the DuckDB connection under lock."""
        with self._lock:
            if params:
                return self.conn.execute(query, params)
            return self.conn.execute(query)

    def query_to_df(self, query: str, params: tuple = None) -> pd.DataFrame:
        """Executes a query and returns the results as a Pandas DataFrame."""
        with self._lock:
            if params:
                return self.conn.execute(query, params).df()
            return self.conn.execute(query).df()

    def register_dataframe(self, df: pd.DataFrame, table_name: str):
        """Registers a Pandas DataFrame as a persistent table in DuckDB."""
        with self._lock:
            # We register the dataframe in the DuckDB connection
            self.conn.register("df_temp", df)
            # Create or replace table
            self.conn.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM df_temp")
            self.conn.unregister("df_temp")
            logger.info(f"Registered table {table_name} in DuckDB ({len(df)} rows)")

    def table_exists(self, table_name: str) -> bool:
        """Checks if a table exists in the DuckDB registry."""
        with self._lock:
            res = self.conn.execute(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?)",
                (table_name.lower(),)
            ).fetchone()
            return res[0] if res else False

    def get_table_row_count(self, table_name: str) -> int:
        """Returns the row count of a table."""
        if not self.table_exists(table_name):
            return 0
        with self._lock:
            res = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
            return res[0] if res else 0

    def close(self):
        """Closes the connection."""
        with self._lock:
            self.conn.close()

# Shared singleton instance
duckdb_engine = DuckDBEngine()
