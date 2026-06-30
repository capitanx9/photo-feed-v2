from django.contrib.auth.password_validation import validate_password
from posts.models import PostMedia
from posts.serializers import PostMediaSerializer
from rest_framework import serializers

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ["id", "email", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data: dict) -> User:  # type: ignore[type-arg]
        user: User = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    avatar = PostMediaSerializer(source="avatar_media", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "avatar"]
        read_only_fields = ["id", "email", "avatar"]


class UserUpdateSerializer(serializers.ModelSerializer):
    # `source="avatar_media"` makes the public input key avatar_media_id
    # while the model field on User is the FK named avatar_media. Pass
    # null to clear the avatar.
    avatar_media_id = serializers.PrimaryKeyRelatedField(
        source="avatar_media",
        queryset=PostMedia.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = User
        fields = ["email", "avatar_media_id"]

    def validate_avatar_media_id(self, media: PostMedia | None) -> PostMedia | None:
        if media is None:
            return None
        user = self.instance
        if user is None or media.owner_id != user.id:
            raise serializers.ValidationError("Media not found or not owned by you")
        if media.kind != PostMedia.Kind.AVATAR:
            raise serializers.ValidationError("Media kind must be 'avatar'")
        if media.status != PostMedia.Status.READY:
            raise serializers.ValidationError("Media must have status='ready'")
        return media


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
