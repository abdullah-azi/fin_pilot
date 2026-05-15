from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TimestampedResponse(ORMModel):
    id: UUID
    created_at: datetime
    updated_at: datetime


MoneyDecimal = Decimal
CalendarDate = date

