import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.common import Page
from app.schemas.project import (
    MemberAdd,
    MemberOut,
    ProjectCreate,
    ProjectListParams,
    ProjectOut,
    ProjectUpdate,
)
from app.services import projects as svc

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(data: ProjectCreate, user: CurrentUser, db: DbSession):
    return svc.create_project(db, user, data)


@router.get("", response_model=Page[ProjectOut])
def list_projects(user: CurrentUser, db: DbSession, params: Annotated[ProjectListParams, Query()]):
    return svc.list_projects(
        db,
        user,
        include_archived=params.include_archived,
        page=params.page,
        page_size=params.page_size,
    )


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: uuid.UUID, user: CurrentUser, db: DbSession):
    project, role = svc.get_project_for_user(db, project_id, user)
    return svc.project_out(db, project, role)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: uuid.UUID, data: ProjectUpdate, user: CurrentUser, db: DbSession):
    return svc.update_project(db, user, project_id, data)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    svc.delete_project(db, user, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/members", response_model=list[MemberOut])
def list_members(project_id: uuid.UUID, user: CurrentUser, db: DbSession):
    return svc.list_members(db, user, project_id)


@router.post("/{project_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def add_member(project_id: uuid.UUID, data: MemberAdd, user: CurrentUser, db: DbSession):
    return svc.add_member(db, user, project_id, data.email)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(project_id: uuid.UUID, user_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    svc.remove_member(db, user, project_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
