from sqlalchemy import text, create_engine
import os
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("DATABASE_URL")
if not url:
    raise SystemExit("DATABASE_URL not found in .env")

# Convert async URL → sync URL
# postgresql+asyncpg://...  →  postgresql://...
sync_url = url.replace("postgresql+asyncpg://", "postgresql://")
sync_url = sync_url.replace("postgres+asyncpg://", "postgresql://")

print("Connecting...")
engine = create_engine(sync_url)
with engine.begin() as conn:
    try:
        conn.execute(text("ALTER TABLE requirements ADD COLUMN company_name VARCHAR(200)"))
        print("OK: company_name column added")
    except Exception as e:
        msg = str(e).lower()
        if "already exists" in msg or "duplicate" in msg:
            print("Column already exists — OK")
        else:
            raise