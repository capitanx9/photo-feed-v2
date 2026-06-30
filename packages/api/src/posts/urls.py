from django.urls import path

from .views import MediaDetailView, UploadURLView, media_processed

urlpatterns = [
    path("upload-url/", UploadURLView.as_view(), name="upload-url"),
    path("media/<int:pk>/", MediaDetailView.as_view(), name="media-detail"),
]

internal_urlpatterns = [
    path("media/processed/", media_processed, name="media-processed"),
]
