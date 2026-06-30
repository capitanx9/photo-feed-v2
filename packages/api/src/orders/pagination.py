from rest_framework.pagination import CursorPagination


class OrdersCursorPagination(CursorPagination):
    page_size = 20
    max_page_size = 100
    ordering = "-created_at"
    cursor_query_param = "cursor"
    page_size_query_param = "page_size"
