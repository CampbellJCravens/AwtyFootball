import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import prisma from '../prisma';
import { env } from '../env';

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${env.BACKEND_URL}/api/auth/google/callback`,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('No email found in Google profile'), undefined);
    }

    // Check if email is in allowlist (optional). If absent, default to regular.
    const allowedEmail = await prisma.allowedEmail.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Create new user with role from allowlist
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: profile.displayName || profile.name?.givenName || null,
          picture: profile.photos?.[0]?.value || null,
          role: allowedEmail?.role || 'regular', // default to regular when not allowlisted
        },
      });
    } else {
      // Update user info and role (in case role changed in allowlist)
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: profile.displayName || profile.name?.givenName || user.name,
          picture: profile.photos?.[0]?.value || user.picture,
          role: allowedEmail?.role || user.role || 'regular', // Refresh role if allowlisted
        },
      });
    }

    return done(null, {
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      picture: user.picture || undefined,
      role: user.role,
    });
  } catch (error) {
    console.error('Passport strategy error:', error);
    return done(error, undefined);
  }
}));

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        role: true,
      },
    });

    if (!user) {
      return done(new Error('User not found'), null);
    }

    done(null, {
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      picture: user.picture || undefined,
      role: user.role,
    });
  } catch (error) {
    console.error('Deserialize user error:', error);
    done(error, null);
  }
});

