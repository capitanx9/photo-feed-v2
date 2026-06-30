from common.s3 import make_download_presign
from rest_framework import serializers

from .models import Post, PostMedia


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


class PostSerializer(serializers.ModelSerializer):
    media = PostMediaSerializer(many=True, read_only=True)
    owner_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Post
        fields = ["id", "owner_id", "caption", "price", "status", "media", "created_at"]
        read_only_fields = ["id", "owner_id", "status", "media", "created_at"]


class PostCreateSerializer(serializers.Serializer):
    caption = serializers.CharField(allow_blank=True, required=False, default="")
    price = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )
    media_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


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
