from django.contrib import admin

from .models import Post, PostMedia


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "status", "price", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("owner__email", "caption")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)


@admin.register(PostMedia)
class PostMediaAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "post", "kind", "status", "s3_key_raw", "created_at")
    list_filter = ("kind", "status", "created_at")
    search_fields = ("owner__email", "s3_key_raw", "s3_key_resized")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)
