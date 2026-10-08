import React from "react";
import { createBrowserRouter } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";
import HomePage from "../pages/HomePage";
import AuthPage from "../pages/AuthPage";
import CreateAssociation from "../pages/CreateAssociation";
import AssociationDetails from "../pages/AssociationDetails";
import EditAssociation from "../pages/EditAssociation";
import ProfilePage from "../pages/ProfilePage";
import ProtectedRoute from "../components/auth/ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "auth", element: <AuthPage /> },
      {
        path: "profile",
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: "create",
        element: (
          <ProtectedRoute>
            <CreateAssociation />
          </ProtectedRoute>
        ),
      },
      {
        path: "association/:id",
        element: (
          <ProtectedRoute>
            <AssociationDetails />
          </ProtectedRoute>
        ),
      },
      {
        path: "association/:id/edit",
        element: (
          <ProtectedRoute>
            <EditAssociation />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
