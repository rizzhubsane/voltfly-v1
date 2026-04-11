"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Zap, Loader2, Mail, Lock } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      router.push("/dashboard");
      router.refresh();
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F1A] relative overflow-hidden">
      {/* Dynamic Gradient Glow Background */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none select-none overflow-hidden">
        {/* The main left-to-right gradient glow */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[120%] opacity-20 blur-[140px] rotate-[15deg]"
          style={{
            background: 'linear-gradient(to right, #37B0CF, #63C193, #B1E727)'
          }}
        />
        
        {/* Additional mood-lighting accents */}
        <div className="absolute top-[10%] left-[10%] w-[40%] h-[40%] rounded-full bg-[#37B0CF]/10 blur-[120px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-[#B1E727]/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-[440px] px-6 relative z-10">
        <div className="flex flex-col items-center justify-center mb-10">
          <div className="mb-6 flex items-center justify-center relative group">
            <div className="absolute inset-0 bg-[#37B0CF]/10 blur-3xl rounded-full scale-150 transition-all group-hover:scale-175 duration-700" />
            <Image 
              src="/logo.png" 
              alt="Voltfly" 
              width={220} 
              height={64} 
              className="relative brightness-125 drop-shadow-[0_0_20px_rgba(55,176,207,0.2)] transition-transform hover:scale-105 duration-500"
              priority
            />
          </div>
          <div className="text-center space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-[#37B0CF]">Admin Console</h2>
            <p className="text-slate-400 font-medium text-[11px]">Secure access for fleet monitoring and operations.</p>
          </div>
        </div>

        <Card className="border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-[2rem] overflow-hidden bg-[#1A1F2B]/40 backdrop-blur-xl p-2">
          <form onSubmit={handleLogin} className="p-4 sm:p-6 lg:p-8 space-y-6">
            <div className="space-y-1.5 text-center">
              <CardTitle className="text-2xl font-bold tracking-tight text-white">Welcome Back</CardTitle>
              <CardDescription className="text-slate-400">Sign in to your account below</CardDescription>
            </div>

            <div className="space-y-4">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-300 text-left">
                  <div className="h-4 w-4 mt-0.5 rounded-full bg-red-400/20 flex items-center justify-center shrink-0">
                    <Zap className="h-2.5 w-2.5" />
                  </div>
                  {error}
                </div>
              )}

              {/* Email */}
              <div className="space-y-2 text-left">
                <Label htmlFor="email" className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Email Address</Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 z-10 transition-colors group-focus-within:text-[#37B0CF]" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="name@voltfly.com" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-11 h-12 rounded-2xl bg-white/5 border-white/5 text-sm font-medium text-white transition-all placeholder:text-slate-600 focus-visible:bg-white/10 focus-visible:ring-4 focus-visible:ring-[#37B0CF]/10 focus-visible:border-[#37B0CF]/50 active:scale-[0.99]"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2 text-left">
                <div className="flex items-center justify-between ml-1">
                  <Label htmlFor="password" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Password</Label>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 z-10 transition-colors group-focus-within:text-[#37B0CF]" />
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 h-12 rounded-2xl bg-white/5 border-white/5 text-sm font-medium text-white transition-all placeholder:text-slate-600 focus-visible:bg-white/10 focus-visible:ring-4 focus-visible:ring-[#37B0CF]/10 focus-visible:border-[#37B0CF]/50 active:scale-[0.99]"
                  />
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-bold bg-[#37B0CF] hover:bg-[#37B0CF]/90 text-white rounded-2xl shadow-lg shadow-[#37B0CF]/10 transition-all active:scale-[0.97] hover:shadow-xl hover:shadow-[#37B0CF]/20" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Continue to Dashboard"
              )}
            </Button>
          </form>
        </Card>

        <p className="mt-8 text-center text-[10px] text-slate-500 uppercase tracking-[0.2em] font-medium leading-relaxed">
          &copy; {new Date().getFullYear()} Voltfly Limited. <br/>All administrative actions are logged.
        </p>
      </div>
    </div>
  );
}
