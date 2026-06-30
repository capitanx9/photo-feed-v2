from common.views import health
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from posts.urls import internal_urlpatterns
from users.urls import auth_urlpatterns, users_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/", include((auth_urlpatterns, "auth"))),
    path("api/users/", include((users_urlpatterns, "users"))),
    path("api/posts/", include("posts.urls")),
    path("internal/", include((internal_urlpatterns, "internal"))),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/schema/swagger-ui/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]
