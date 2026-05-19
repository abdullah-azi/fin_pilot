import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { LoginPayload, SignupPayload } from '@/lib/api/auth';
import { API_BASE_URL } from '@/lib/api/config';
import { useAuth } from '@/providers/AuthProvider';
import { FinPilotLogo } from '@/components/branding/FinPilotLogo';
import { authPalette, radius, shadows, spacing, typography } from '@/constants/theme';

type AuthMode = 'login' | 'signup';

type LoginFormState = {
  email: string;
  password: string;
};

type SignupFormState = {
  country: string;
  currency: string;
  email: string;
  fullName: string;
  password: string;
};

type SignupCountryOption = 'Europe' | 'Pakistan' | 'Qatar' | 'USA';
type SignupCurrencyOption = 'EUR' | 'PKR' | 'QAR' | 'USD';

const AUTH_COLORS = authPalette;

const INTRO_DELAY_MS = 5000;
const COUNTRY_TO_CURRENCY: Record<SignupCountryOption, SignupCurrencyOption> = {
  Europe: 'EUR',
  Pakistan: 'PKR',
  Qatar: 'QAR',
  USA: 'USD',
};
const CURRENCY_TO_COUNTRY: Record<SignupCurrencyOption, SignupCountryOption> = {
  EUR: 'Europe',
  PKR: 'Pakistan',
  QAR: 'Qatar',
  USD: 'USA',
};
const COUNTRY_OPTIONS = Object.keys(COUNTRY_TO_CURRENCY) as SignupCountryOption[];
const CURRENCY_OPTIONS = Object.keys(CURRENCY_TO_COUNTRY) as SignupCurrencyOption[];
const DEFAULT_SIGNUP_COUNTRY: SignupCountryOption = 'Pakistan';
const DEFAULT_SIGNUP_CURRENCY: SignupCurrencyOption = COUNTRY_TO_CURRENCY[DEFAULT_SIGNUP_COUNTRY];

export default function AuthScreen() {
  const { error, isAuthenticated, isBootstrapping, isSubmitting, login, signup } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showIntro, setShowIntro] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const introOpacity = useRef(new Animated.Value(1)).current;
  const introScale = useRef(new Animated.Value(1)).current;
  const authOpacity = useRef(new Animated.Value(0)).current;
  const authTranslateY = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(introOpacity, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(introScale, {
          toValue: 0.92,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(authOpacity, {
          toValue: 1,
          duration: 650,
          delay: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(authTranslateY, {
          toValue: 0,
          duration: 650,
          delay: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowIntro(false);
      });
    }, INTRO_DELAY_MS);

    return () => clearTimeout(timer);
  }, [authOpacity, authTranslateY, introOpacity, introScale]);

  useEffect(() => {
    if (!showIntro && !isBootstrapping && isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isBootstrapping, showIntro]);

  const displayError = localError ?? error;

  async function handleLoginSubmit(payload: LoginPayload) {
    const validationError = validateLogin(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);

    try {
      await login(payload);
      router.replace('/(tabs)');
    } catch {
      // Error state is managed by the auth provider.
    }
  }

  async function handleSignupSubmit(payload: SignupPayload) {
    const validationError = validateSignup(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);

    try {
      await signup(payload);
      router.replace('/(tabs)');
    } catch {
      // Error state is managed by the auth provider.
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbBottom} />

      {showIntro ? (
        <Animated.View
          style={[
            styles.introScreen,
            {
              opacity: introOpacity,
              transform: [{ scale: introScale }],
            },
          ]}
        >
          <LogoMark centered />
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.authShell,
          {
            opacity: authOpacity,
            transform: [{ translateY: authTranslateY }],
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoRow}>
            <LogoMark />
          </View>

          <Text style={styles.heading}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </Text>
          <Text style={styles.subheading}>
            {mode === 'login'
              ? 'Log in to your account to continue managing your money.'
              : 'Start understanding your money in minutes.'}
          </Text>

          <View style={styles.toggleRow}>
            <AuthToggleButton
              active={mode === 'login'}
              label="Log in"
              onPress={() => {
                setLocalError(null);
                setMode('login');
              }}
            />
            <AuthToggleButton
              active={mode === 'signup'}
              label="Sign up"
              onPress={() => {
                setLocalError(null);
                setMode('signup');
              }}
            />
          </View>

          {displayError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{displayError}</Text>
            </View>
          ) : null}

          {mode === 'signup' ? (
            <SignupForm
              apiBaseUrl={API_BASE_URL}
              isSubmitting={isSubmitting}
              onSubmit={(payload) => void handleSignupSubmit(payload)}
              onSwitchMode={() => {
                setLocalError(null);
                setMode('login');
              }}
            />
          ) : (
            <LoginForm
              apiBaseUrl={API_BASE_URL}
              isSubmitting={isSubmitting}
              onSubmit={(payload) => void handleLoginSubmit(payload)}
              onSwitchMode={() => {
                setLocalError(null);
                setMode('signup');
              }}
            />
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

function LoginForm({
  apiBaseUrl,
  isSubmitting,
  onSubmit,
  onSwitchMode,
}: {
  apiBaseUrl: string;
  isSubmitting: boolean;
  onSubmit: (payload: LoginPayload) => void;
  onSwitchMode: () => void;
}) {
  const emailRef = useRef('');
  const passwordRef = useRef('');

  return (
    <View>
      <Field
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        icon="envelope-o"
        keyboardType="email-address"
        label="EMAIL"
        placeholder="you@example.com"
        initialValue=""
        onValueChange={(value) => {
          emailRef.current = value;
        }}
      />
      <Field
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        icon="lock"
        label="PASSWORD"
        placeholder="Enter your password"
        secureTextEntry
        initialValue=""
        onValueChange={(value) => {
          passwordRef.current = value;
        }}
      />

      <Pressable>
        <Text style={styles.forgotPassword}>Forgot password?</Text>
      </Pressable>

      <Pressable
        disabled={isSubmitting}
        onPress={() =>
          onSubmit({
            email: emailRef.current.trim().toLowerCase(),
            password: passwordRef.current,
          })
        }
        style={styles.primaryButton}
      >
        {isSubmitting ? (
          <ActivityIndicator color={AUTH_COLORS.text} />
        ) : (
          <Text style={styles.primaryButtonText}>Log in</Text>
        )}
      </Pressable>

      <Divider />

      <Pressable disabled style={[styles.socialButton, styles.disabledButton]}>
        <FontAwesome color={AUTH_COLORS.textMuted} name="google" size={14} />
        <Text style={[styles.socialButtonText, styles.disabledText]}>Google login comes later</Text>
      </Pressable>

      <Text style={styles.footerText}>
        Don&apos;t have an account?{' '}
        <Text onPress={onSwitchMode} style={styles.linkText}>
          Sign up
        </Text>
      </Text>
      <Text style={styles.apiHint}>Backend: {apiBaseUrl}</Text>
    </View>
  );
}

function SignupForm({
  apiBaseUrl,
  isSubmitting,
  onSubmit,
  onSwitchMode,
}: {
  apiBaseUrl: string;
  isSubmitting: boolean;
  onSubmit: (payload: SignupPayload) => void;
  onSwitchMode: () => void;
}) {
  const [country, setCountry] = useState<SignupCountryOption>(DEFAULT_SIGNUP_COUNTRY);
  const [currency, setCurrency] = useState<SignupCurrencyOption>(DEFAULT_SIGNUP_CURRENCY);
  const [passwordValue, setPasswordValue] = useState('');
  const fullNameRef = useRef('');
  const emailRef = useRef('');
  const passwordRef = useRef('');
  const passwordStrength = useMemo(() => getPasswordStrength(passwordValue), [passwordValue]);

  return (
    <View>
      <Field
        autoCapitalize="words"
        autoComplete="off"
        autoCorrect={false}
        icon="user-o"
        label="FULL NAME"
        placeholder="Ahmed Khan"
        initialValue=""
        onValueChange={(value) => {
          fullNameRef.current = value;
        }}
      />
      <Field
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        icon="envelope-o"
        keyboardType="email-address"
        label="EMAIL"
        placeholder="you@example.com"
        initialValue=""
        onValueChange={(value) => {
          emailRef.current = value;
        }}
      />
      <Field
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        icon="lock"
        label="PASSWORD"
        placeholder="At least 8 characters"
        secureTextEntry
        initialValue=""
        onValueChange={(value) => {
          passwordRef.current = value;
          setPasswordValue(value);
        }}
      />
      <View style={styles.inlineFields}>
        <View style={styles.inlineField}>
          <SelectField
            icon="money"
            label="CURRENCY"
            options={CURRENCY_OPTIONS}
            value={currency}
            onSelect={(value) => {
              setCurrency(value);
              setCountry(CURRENCY_TO_COUNTRY[value] ?? country);
            }}
          />
        </View>
        <View style={styles.inlineField}>
          <SelectField
            icon="globe"
            label="COUNTRY"
            options={COUNTRY_OPTIONS}
            value={country}
            onSelect={(value) => {
              setCountry(value);
              setCurrency(COUNTRY_TO_CURRENCY[value] ?? currency);
            }}
          />
        </View>
      </View>

      <View style={styles.strengthBars}>
        {passwordStrength.bars.map((color, index) => (
          <View key={index} style={[styles.strengthBar, { backgroundColor: color }]} />
        ))}
      </View>
      <Text style={[styles.strengthText, { color: passwordStrength.tint }]}>
        {passwordStrength.copy}
      </Text>

      <Pressable
        disabled={isSubmitting}
        onPress={() =>
          onSubmit({
            country: country.trim() || null,
            currency: currency.trim().toUpperCase() || DEFAULT_SIGNUP_CURRENCY,
            email: emailRef.current.trim().toLowerCase(),
            full_name: fullNameRef.current.trim() || null,
            password: passwordRef.current,
          })
        }
        style={[styles.primaryButton, styles.primaryButtonSpaced]}
      >
        {isSubmitting ? (
          <ActivityIndicator color={AUTH_COLORS.text} />
        ) : (
          <Text style={styles.primaryButtonText}>Create account</Text>
        )}
      </Pressable>

      <Divider />

      <Pressable disabled style={[styles.socialButton, styles.disabledButton]}>
        <FontAwesome color={AUTH_COLORS.textMuted} name="google" size={14} />
        <Text style={[styles.socialButtonText, styles.disabledText]}>Google signup comes later</Text>
      </Pressable>

      <Text style={styles.termsText}>
        By signing up you agree to our <Text style={styles.linkText}>Terms</Text> and{' '}
        <Text style={styles.linkText}>Privacy Policy</Text>
      </Text>
      <Text style={styles.footerText}>
        Already have an account?{' '}
        <Text onPress={onSwitchMode} style={styles.linkText}>
          Log in
        </Text>
      </Text>
      <Text style={styles.apiHint}>Backend: {apiBaseUrl}</Text>
    </View>
  );
}

function Field({
  icon,
  initialValue = '',
  label,
  onValueChange,
  ...inputProps
}: Omit<React.ComponentProps<typeof TextInput>, 'onChangeText' | 'value'> & {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  initialValue?: string;
  label: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldInput, value ? styles.fieldInputActive : null]}>
        <TextInput
          autoComplete="off"
          importantForAutofill="no"
          placeholderTextColor={AUTH_COLORS.textSoft}
          style={styles.fieldValue}
          textContentType="none"
          value={value}
          onChangeText={(nextValue) => {
            setValue(nextValue);
            onValueChange?.(nextValue);
          }}
          {...inputProps}
        />
        <FontAwesome color={value ? AUTH_COLORS.violetBright : AUTH_COLORS.textSoft} name={icon} size={14} />
      </View>
    </View>
  );
}

function SelectField<T extends string>({
  icon,
  label,
  options,
  value,
  onSelect,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  options: readonly T[];
  value: T;
  onSelect: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        style={[styles.fieldInput, styles.selectTrigger, value ? styles.fieldInputActive : null]}
      >
        <Text style={styles.fieldValue}>{value}</Text>
        <View style={styles.selectIconRow}>
          <FontAwesome
            color={value ? AUTH_COLORS.violetBright : AUTH_COLORS.textSoft}
            name={icon}
            size={14}
          />
          <FontAwesome
            color={AUTH_COLORS.textSoft}
            name={open ? 'chevron-up' : 'chevron-down'}
            size={12}
          />
        </View>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        transparent
        visible={open}
      >
        <Pressable onPress={() => setOpen(false)} style={styles.selectModalBackdrop}>
          <Pressable onPress={() => undefined} style={styles.selectModalCard}>
            <Text style={styles.selectModalTitle}>{label}</Text>
            <View style={styles.selectMenu}>
              {options.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                  style={[styles.selectOption, option === value ? styles.selectOptionActive : null]}
                >
                  <Text
                    style={[
                      styles.selectOptionText,
                      option === value ? styles.selectOptionTextActive : null,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Divider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or continue with</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function AuthToggleButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.toggleButton, active ? styles.toggleButtonActive : null]}>
      <Text style={[styles.toggleText, active ? styles.toggleTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function LogoMark({ centered = false }: { centered?: boolean }) {
  const width = centered ? 228 : 164;

  return (
    <View style={[styles.logoMark, centered ? styles.logoMarkCentered : null]}>
      <FinPilotLogo showTagline={centered} width={width} />
    </View>
  );
}

function validateEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function validateLogin(payload: LoginPayload) {
  if (!validateEmail(payload.email)) {
    return 'Enter a valid email address.';
  }

  if (payload.password.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  return null;
}

function validateSignup(payload: SignupPayload) {
  if (!payload.full_name?.trim()) {
    return 'Full name is required.';
  }

  if (!validateEmail(payload.email)) {
    return 'Enter a valid email address.';
  }

  if (payload.password.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  if (payload.currency && payload.currency.length !== 3) {
    return 'Currency should be a 3-letter code like USD.';
  }

  return null;
}

type PasswordStrength = {
  bars: string[];
  copy: string;
  tint: string;
};

function getPasswordStrength(password: string): PasswordStrength {
  const score =
    Number(password.length >= 8) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  if (!password) {
    return {
      bars: [AUTH_COLORS.border, AUTH_COLORS.border, AUTH_COLORS.border, AUTH_COLORS.border],
      copy: 'Use at least 8 characters with numbers and symbols.',
      tint: AUTH_COLORS.textSoft,
    };
  }

  if (score <= 1) {
    return {
      bars: [AUTH_COLORS.danger, AUTH_COLORS.border, AUTH_COLORS.border, AUTH_COLORS.border],
      copy: 'Weak password — add length, numbers, and symbols.',
      tint: AUTH_COLORS.danger,
    };
  }

  if (score <= 3) {
    return {
      bars: [AUTH_COLORS.green, AUTH_COLORS.green, AUTH_COLORS.amber, AUTH_COLORS.border],
      copy: 'Medium strength — add a symbol or uppercase letter.',
      tint: AUTH_COLORS.amber,
    };
  }

  return {
    bars: [AUTH_COLORS.green, AUTH_COLORS.green, AUTH_COLORS.green, AUTH_COLORS.green],
    copy: 'Strong password.',
    tint: AUTH_COLORS.green,
  };
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AUTH_COLORS.background,
  },
  backgroundOrbTop: {
    position: 'absolute',
    top: -90,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: 'rgba(124,58,237,0.18)',
  },
  backgroundOrbBottom: {
    position: 'absolute',
    bottom: -120,
    left: -70,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(159,103,255,0.12)',
  },
  introScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AUTH_COLORS.background,
  },
  authShell: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.xl + 4,
    paddingBottom: spacing.xxl + 8,
  },
  logoRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg + 10,
  },
  logoMark: {
    alignSelf: 'center',
  },
  logoMarkCentered: {
    ...shadows.authLogo,
    alignSelf: 'center',
    marginTop: -8,
  },
  heading: {
    color: AUTH_COLORS.text,
    ...typography.display,
    textAlign: 'center',
    marginBottom: 8,
  },
  subheading: {
    color: AUTH_COLORS.textMuted,
    ...typography.label,
    textAlign: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl + 2,
    maxWidth: 304,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: AUTH_COLORS.surface,
    borderColor: AUTH_COLORS.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  toggleButton: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 11,
  },
  toggleButtonActive: {
    backgroundColor: AUTH_COLORS.violet,
  },
  toggleText: {
    color: AUTH_COLORS.textSoft,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: AUTH_COLORS.text,
  },
  errorBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(240,106,99,0.35)',
    backgroundColor: 'rgba(240,106,99,0.12)',
    marginBottom: spacing.lg - 2,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
  },
  errorBannerText: {
    color: AUTH_COLORS.danger,
    ...typography.caption,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: AUTH_COLORS.textSoft,
    ...typography.microLabel,
    marginBottom: 7,
  },
  fieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AUTH_COLORS.surface,
    borderColor: AUTH_COLORS.border,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  fieldInputActive: {
    borderColor: AUTH_COLORS.violet,
    ...shadows.authCard,
  },
  fieldValue: {
    color: AUTH_COLORS.text,
    flex: 1,
    ...typography.body,
    fontWeight: '500',
    paddingRight: 10,
  },
  selectTrigger: {
    minHeight: 54,
  },
  selectIconRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  selectMenu: {
    backgroundColor: AUTH_COLORS.surfaceRaised,
    overflow: 'hidden',
  },
  selectModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.lg,
  },
  selectModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: AUTH_COLORS.border,
    backgroundColor: AUTH_COLORS.surfaceRaised,
    overflow: 'hidden',
  },
  selectModalTitle: {
    color: AUTH_COLORS.text,
    ...typography.sectionTitle,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  selectOption: {
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
  },
  selectOptionActive: {
    backgroundColor: 'rgba(124,58,237,0.16)',
  },
  selectOptionText: {
    color: AUTH_COLORS.text,
    ...typography.body,
  },
  selectOptionTextActive: {
    color: AUTH_COLORS.violetBright,
    fontWeight: '600',
  },
  forgotPassword: {
    color: AUTH_COLORS.violetBright,
    textAlign: 'right',
    ...typography.caption,
    marginTop: -2,
    marginBottom: 22,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    borderRadius: radius.lg - 2,
    backgroundColor: AUTH_COLORS.violet,
    ...shadows.authButton,
    marginBottom: 18,
  },
  primaryButtonSpaced: {
    marginTop: 8,
  },
  primaryButtonText: {
    color: AUTH_COLORS.text,
    ...typography.bodyStrong,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: AUTH_COLORS.border,
  },
  dividerText: {
    color: AUTH_COLORS.textSoft,
    ...typography.microLabel,
    fontWeight: '500',
    letterSpacing: 0,
  },
  socialButton: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: AUTH_COLORS.border,
    backgroundColor: AUTH_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  socialButtonText: {
    color: AUTH_COLORS.text,
    ...typography.label,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.7,
  },
  disabledText: {
    color: AUTH_COLORS.textMuted,
  },
  footerText: {
    color: AUTH_COLORS.textMuted,
    textAlign: 'center',
    ...typography.caption,
    marginTop: 20,
  },
  linkText: {
    color: AUTH_COLORS.violetBright,
    fontWeight: '600',
  },
  inlineFields: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineField: {
    flex: 1,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -4,
    marginBottom: 4,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 999,
  },
  strengthText: {
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 2,
  },
  termsText: {
    color: AUTH_COLORS.textMuted,
    ...typography.microLabel,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 12,
  },
  apiHint: {
    color: AUTH_COLORS.textSoft,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 16,
    textAlign: 'center',
  },
});
