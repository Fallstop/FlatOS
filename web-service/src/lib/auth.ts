import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { users } from "@/lib/db/schema";

// Check if a user is whitelisted (exists in our users table)
async function isWhitelisted(email: string): Promise<boolean> {
    const adminEmail = process.env.ADMIN_USER;

    // Admin is always allowed
    if (email === adminEmail) {
        return true;
    }

    // Check if user exists in database
    const existingUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    return existingUsers.length > 0;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: DrizzleAdapter(db),
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            allowDangerousEmailAccountLinking: true,
        }),
    ],
    callbacks: {
        async signIn({ user, account, profile }) {
            if (!user.email) {
                return false;
            }

            // Ensure Google email is verified
            if (account?.provider === "google") {
                if (!profile?.email_verified) {
                    return false;
                }
            }

            const whitelisted = await isWhitelisted(user.email);
            if (!whitelisted) {
                return "/auth/not-authorized";
            }

            // Update emailVerified for existing users who haven't signed in yet
            // This handles pre-created flatmate accounts
            if (account?.provider === "google" && profile?.email_verified) {
                const existingUser = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, user.email))
                    .limit(1);

                if (existingUser.length > 0 && existingUser[0].emailVerified === null) {
                    await db
                        .update(users)
                        .set({ 
                            emailVerified: new Date(),
                            name: existingUser[0].name || profile.name || null,
                            image: profile.picture || null,
                        })
                        .where(eq(users.id, existingUser[0].id));
                }
            }

            return true;
        },
        async session({ session }) {
            if (session.user?.email) {
                const dbUsers = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, session.user.email))
                    .limit(1);

                if (dbUsers.length > 0) {
                    session.user.id = dbUsers[0].id;
                    session.user.role = dbUsers[0].role;
                }
            }
            return session;
        },
    },
    events: {
        async createUser({ user }) {
            const adminEmail = process.env.ADMIN_USER;
            if (user.email && user.email === adminEmail) {
                await db
                    .update(users)
                    .set({ role: "admin" })
                    .where(eq(users.email, user.email));
            }
        },
    },
    pages: {
        signIn: "/auth/signin",
        error: "/auth/error",
    },
    session: {
        strategy: "jwt",
    },
});
