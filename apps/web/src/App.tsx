/** Routes for the SPA. Protected pages live under the AppLayout shell. */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { AppLayout } from "@/features/layout/AppLayout";
import { UploadPage } from "@/features/scores/pages/UploadPage";
import { MyScoresPage } from "@/features/scores/pages/MyScoresPage";
import { SignInPage } from "@/features/auth/pages/SignInPage";
import { Toaster } from "@/components/ui/sonner";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<UploadPage />} />
            <Route path="/scores" element={<MyScoresPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-center" />
      </AuthProvider>
    </BrowserRouter>
  );
}
