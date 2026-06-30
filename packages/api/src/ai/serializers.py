from common.s3 import make_download_presign_for_generated
from rest_framework import serializers

from .models import GenerationJob

# Fixed aspect ratio for now: SD3 derives image size from aspect_ratio
# (1:1 -> 1024x1024). The UI doesn't expose ratio yet, and negative
# prompts are server-controlled to keep generations predictable.
FIXED_ASPECT_RATIO = "1:1"


class GenerationCreateSerializer(serializers.Serializer):
    prompt = serializers.CharField(min_length=1, max_length=500)
    variants_count = serializers.IntegerField(min_value=1, max_value=4)


class GenerationCreateResponseSerializer(serializers.Serializer):
    job_id = serializers.IntegerField()
    status_url = serializers.CharField()


class ApproveRequestSerializer(serializers.Serializer):
    variant_index = serializers.IntegerField(min_value=0)


class GenerationJobSerializer(serializers.ModelSerializer):
    image_urls = serializers.SerializerMethodField()

    class Meta:
        model = GenerationJob
        fields = [
            "id",
            "prompt",
            "variants_count",
            "aspect_ratio",
            "status",
            "image_urls",
            "error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_image_urls(self, obj: GenerationJob) -> list[str]:
        if obj.status != GenerationJob.Status.READY:
            return []
        return [make_download_presign_for_generated(key=key) for key in obj.image_keys]
