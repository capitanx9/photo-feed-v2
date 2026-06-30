from django.urls import path
from posts.views import UserPostsView

from .views import LoginView, LogoutView, MeView, PublicUserView, RefreshView, RegisterView

auth_urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("me/", MeView.as_view(), name="me"),
]


users_urlpatterns = [
    path("<int:pk>/", PublicUserView.as_view(), name="user-detail"),
    path("<int:pk>/posts/", UserPostsView.as_view(), name="user-posts"),
]
