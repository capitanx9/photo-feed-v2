from django.urls import path

from .tts import PostTTSView
from .views import (
    MediaDetailView,
    PostDetailView,
    PostListCreateView,
    UploadURLView,
    media_processed,
)

urlpatterns = [
    path("", PostListCreateView.as_view(), name="post-list"),
    path("upload-url/", UploadURLView.as_view(), name="upload-url"),
    path("media/<int:pk>/", MediaDetailView.as_view(), name="media-detail"),
    path("<int:pk>/", PostDetailView.as_view(), name="post-detail"),
    path("<int:pk>/tts/", PostTTSView.as_view(), name="post-tts"),
]

internal_urlpatterns = [
    path("media/processed/", media_processed, name="media-processed"),
]
