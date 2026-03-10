export interface User {
  id: number;
  name: string;
  email: string;
  role: "user";
  profilePhoto?: string | null;
  hasSecuredPassword?: boolean;
}

export interface Document {
  id: number;
  title: string;
  file_path: string;
  category: string;
  description: string;
  tags: string;
  upload_date: string;
  department: string;
  user_id: number;
  uploaded_by: string;
  mime_type: string;
  size: number;
  content?: string;
  shared_by_email?: string;
  shared_at?: string;
  permission?: string;
  shared_status?: "pending" | "accepted" | "declined";
  shared_to_email?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
