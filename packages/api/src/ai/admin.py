from django.contrib import admin

from .models import GenerationJob


@admin.register(GenerationJob)
class GenerationJobAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "status", "variants_count", "aspect_ratio", "created_at")
    list_filter = ("status", "aspect_ratio", "created_at")
    search_fields = ("user__email", "prompt")
    readonly_fields = ("created_at", "updated_at", "image_keys", "seeds")
    ordering = ("-created_at",)
