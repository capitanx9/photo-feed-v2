from rest_framework import serializers


class ErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()


class HealthSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
