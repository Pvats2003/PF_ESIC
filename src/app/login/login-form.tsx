"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CircleAlert, Eye, EyeOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { signIn } from "./actions";
import { loginSchema, type LoginInput } from "./schema";

export function LoginForm({ disabled }: { disabled?: boolean }) {
  const next = useSearchParams().get("next") ?? undefined;
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string>();
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(undefined);
    startTransition(async () => {
      const res = await signIn({ ...values, next });
      if (res?.error) setServerError(res.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...register("email")} />
        {errors.email && <FieldHint error>{errors.email.message}</FieldHint>}
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="pr-12" aria-invalid={!!errors.password} {...register("password")} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-faint hover:text-ink"
          >
            {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </div>
        {errors.password && <FieldHint error>{errors.password.message}</FieldHint>}
      </div>
      {serverError && (
        <div role="alert" className="flex gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger ring-1 ring-danger-line ring-inset">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {serverError}
        </div>
      )}
      <Button type="submit" size="lg" block disabled={pending || disabled}>
        {pending ? "Signing in…" : <>Sign in <ArrowRight /></>}
      </Button>
    </form>
  );
}
