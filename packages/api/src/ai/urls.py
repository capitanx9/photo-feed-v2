from django.urls import path

from .views import GenerateView, JobDetailView

urlpatterns = [
    path("generate/", GenerateView.as_view(), name="generate"),
    path("jobs/<int:pk>/", JobDetailView.as_view(), name="job-detail"),
]
