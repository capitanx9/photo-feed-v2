from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from .schema import health_schema
from .serializers import HealthSerializer


@health_schema(
    summary="Liveness probe",
    description=(
        "Returns 200 if the Django process is alive and able to respond. "
        "Used by nginx upstream health checks and apply.sh smoke checks."
    ),
    request=None,
    responses={200: HealthSerializer},
)
@api_view(["GET"])
@permission_classes([AllowAny])
def health(_request: Request) -> Response:
    return Response({"ok": True})
