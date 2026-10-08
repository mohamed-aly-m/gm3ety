import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Phone, PlusCircle, LogOut, Wallet } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <Card className="space-y-6 text-center p-6 border border-app shadow-md">
        {/* User Avatar */}
        <div className="w-20 h-20 rounded-full bg-sky-700 text-white flex items-center justify-center mx-auto text-2xl font-bold shadow-md">
          {user.name ? user.name.charAt(0) : <User className="w-8 h-8" />}
        </div>

        {/* User Details */}
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-app-primary">{user.name}</h1>
          <p className="text-xs text-app-secondary">منظم الجمعيات الادخارية</p>
        </div>

        {/* User Info Details */}
        <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl text-xs space-y-2.5 text-right border border-app">
          {user.email && (
            <div className="flex items-center justify-between">
              <span className="text-app-secondary flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                <span>البريد الإلكتروني:</span>
              </span>
              <strong className="text-app-primary dir-ltr font-mono">{user.email}</strong>
            </div>
          )}

          {user.mobile && (
            <div className={`flex items-center justify-between ${user.email ? "pt-2 border-t border-app/50" : ""}`}>
              <span className="text-app-secondary flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                <span>رقم الموبايل:</span>
              </span>
              <strong className="text-app-primary dir-ltr font-mono">{user.mobile}</strong>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-2 border-t border-app flex flex-col gap-3">
          <Link to="/create" className="w-full">
            <Button variant="primary" className="w-full">
              <PlusCircle className="w-4 h-4" />
              <span>إنشاء جمعية جديدة</span>
            </Button>
          </Link>

          <Link to="/" className="w-full">
            <Button variant="secondary" className="w-full">
              <Wallet className="w-4 h-4" />
              <span>الذهاب إلى جمعياتي</span>
            </Button>
          </Link>

          <Button
            variant="danger"
            className="w-full"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
