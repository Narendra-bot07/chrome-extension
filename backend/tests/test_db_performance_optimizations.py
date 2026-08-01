"""Unit tests for database query performance optimizations."""

import unittest
from unittest.mock import MagicMock
from repositories.resume_repository import ResumeRepository
from repositories.application_repository import ApplicationRepository
from services.subscriptions.usage_service import UsageService

class TestDatabasePerformanceOptimizations(unittest.TestCase):

    def test_enrich_resume_records_batch_empty(self):
        mock_conn = MagicMock()
        repo = ResumeRepository(mock_conn)
        mock_cur = MagicMock()
        result = repo._enrich_resume_records_batch([], mock_cur)
        self.assertEqual(result, [])

    def test_enrich_resume_records_batch_multiple(self):
        mock_conn = MagicMock()
        repo = ResumeRepository(mock_conn)
        mock_cur = MagicMock()

        # Mock fetchall returns
        mock_cur.fetchall.side_effect = [
            # 1. Version counts
            [{"resume_id": "r1", "v_count": 3}, {"resume_id": "r2", "v_count": 1}],
            # 2. Current versions
            [
                {"resume_id": "r1", "id": "v1_id", "ats_score": 85, "resume_match_score": 90},
                {"resume_id": "r2", "id": "v2_id", "ats_score": 75, "resume_match_score": 80}
            ],
            # 3. Usage scores
            []
        ]

        records = [
            {"id": "r1", "parsed_content": {}},
            {"id": "r2", "parsed_content": {}}
        ]

        enriched = repo._enrich_resume_records_batch(records, mock_cur)

        self.assertEqual(len(enriched), 2)
        self.assertEqual(enriched[0]["versions_count"], 3)
        self.assertEqual(enriched[0]["latest_ats_score"], 85)
        self.assertEqual(enriched[1]["versions_count"], 1)
        self.assertEqual(enriched[1]["latest_ats_score"], 75)
        # Verify exactly 3 SQL queries executed instead of N+1
        self.assertEqual(mock_cur.execute.call_count, 3)

    def test_application_list_summary_columns(self):
        mock_conn = MagicMock()
        repo = ApplicationRepository(mock_conn)
        mock_cur = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_cur.fetchall.return_value = [{"id": "app1", "company_name": "Acme"}]

        res = repo.list_by_user("user123", include_details=False)

        self.assertEqual(len(res), 1)
        executed_sql = mock_cur.execute.call_args[0][0]
        self.assertIn("SELECT id, user_id, company_name", executed_sql)
        self.assertNotIn("SELECT *", executed_sql)

if __name__ == "__main__":
    unittest.main()
