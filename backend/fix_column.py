import asyncio
from app.core.database import engine
from sqlalchemy import text


async def main():
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE resume_extracted_data ALTER COLUMN confidence_summary TYPE TEXT;")
        )
    print("Column widened successfully.")


asyncio.run(main())