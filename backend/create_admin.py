import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash

async def create_admin():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == "admin@example.com"))
        existing = result.scalar_one_or_none()
        
        if existing:
            print("Admin already exists")
            return
        
        user = User(
            name="Admin",
            email="admin@example.com",
            password_hash=get_password_hash("admin123"),
            role="admin",
            is_active=True
        )
        db.add(user)
        await db.commit()
        print("Admin user created successfully!")
        print("Email   : admin@example.com")
        print("Password: admin123")

if __name__ == "__main__":
    asyncio.run(create_admin())