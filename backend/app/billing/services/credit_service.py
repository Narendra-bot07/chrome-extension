from psycopg2.extras import RealDictCursor
from typing import Dict, Any, Optional
import uuid

class CreditService:
    def __init__(self, conn):
        self.conn = conn

    def add_credits(self, user_id: str, payment_id: Optional[str], amount: int, reason: str = "Subscription renewal") -> Dict[str, Any]:
        """
        Atomically adds credits to a user and logs the transaction.
        If amount is -1, it denotes 'unlimited'.
        """
        if amount == 0:
            return {}

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # First lock the user row to prevent race conditions
            cur.execute("SELECT credits_remaining FROM public.users WHERE id = %s FOR UPDATE", (user_id,))
            user = cur.fetchone()
            if not user:
                raise ValueError("User not found")
                
            current_credits = user["credits_remaining"]
            
            # If they already have unlimited (-1) or we are granting unlimited (-1)
            if amount == -1 or current_credits == -1:
                new_balance = -1
            else:
                new_balance = current_credits + amount
                
            # Update user table
            cur.execute(
                "UPDATE public.users SET credits_remaining = %s WHERE id = %s",
                (new_balance, user_id)
            )
            
            # Log transaction
            transaction_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO public.credit_transactions 
                (id, user_id, payment_id, credits, type, reason, balance_after)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (transaction_id, user_id, payment_id, amount, 'addition', reason, new_balance)
            )
            transaction = cur.fetchone()
            self.conn.commit()
            return dict(transaction)

    def deduct_credits(self, user_id: str, amount: int = 1, reason: str = "Usage") -> bool:
        """
        Atomically deducts credits from a user. Returns True if successful.
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT credits_remaining, credits_used FROM public.users WHERE id = %s FOR UPDATE", (user_id,))
            user = cur.fetchone()
            if not user:
                raise ValueError("User not found")
                
            current_credits = user["credits_remaining"]
            current_used = user["credits_used"] or 0
            
            # Unlimited check
            if current_credits == -1:
                new_balance = -1
            elif current_credits >= amount:
                new_balance = current_credits - amount
            else:
                self.conn.rollback()
                return False
                
            cur.execute(
                "UPDATE public.users SET credits_remaining = %s, credits_used = %s WHERE id = %s",
                (new_balance, current_used + amount, user_id)
            )
            
            # Log transaction
            cur.execute(
                """
                INSERT INTO public.credit_transactions 
                (id, user_id, payment_id, credits, type, reason, balance_after)
                VALUES (%s, %s, NULL, %s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), user_id, amount, 'deduction', reason, new_balance)
            )
            self.conn.commit()
            return True
