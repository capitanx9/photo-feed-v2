from common.s3 import make_download_presign
from rest_framework import serializers

from .models import PostMedia


class PostMediaSerializer(serializers.ModelSerializer):
    """Serialiser used both for media polling and for embedding inside a Post.

    `url` is minted on the fly: a presigned GET against the resized key if
    the media is READY, otherwise null. Storing the URL in the DB would
    expire and force a refresh anyway, so we always generate it fresh.
    """

    url = serializers.SerializerMethodField()

    class Meta:
        model = PostMedia
        fields = ["id", "kind", "status", "url", "created_at"]
        read_only_fields = fields

    def get_url(self, obj: PostMedia) -> str | None:
        key = obj.s3_key_resized or obj.s3_key_raw
        if not key or obj.status != PostMedia.Status.READY:
            return None
        return make_download_presign(key=key)


class UploadURLRequestSerializer(serializers.Serializer):
    content_type = serializers.CharField()
    content_length = serializers.IntegerField(min_value=1)
    kind = serializers.ChoiceField(
        choices=PostMedia.Kind.choices,
        default=PostMedia.Kind.POST,
    )


class UploadURLResponseSerializer(serializers.Serializer):
    media_id = serializers.IntegerField()
    upload_url = serializers.URLField()
    s3_key = serializers.CharField()
    expires_in = serializers.IntegerField()


class MediaProcessedSerializer(serializers.Serializer):
    s3_key = serializers.CharField()
    s3_key_resized = serializers.CharField(allow_blank=True, required=False, default="")
    status = serializers.ChoiceField(choices=[PostMedia.Status.READY, PostMedia.Status.FAILED])
