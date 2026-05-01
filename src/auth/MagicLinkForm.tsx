import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  Dimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  withTiming,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './useAuth';
import { useAppTheme } from '../constants/theme';
import { isValidEmail } from '../core/validation';

interface MagicLinkFormProps {
  onBack: () => void;
}

export default function MagicLinkForm({ onBack }: MagicLinkFormProps) {
  const { sendMagicLink } = useAuth();
  const { theme } = useAppTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [canResend, setCanResend] = useState(true);

  const progressValue = useSharedValue(0);
  const { width } = Dimensions.get('window');
  const maxWidth = Math.min(width - 40, 480);
  const successOpacity = useSharedValue(0);

  // Countdown timer for resend
  useEffect(() => {
    if (timeRemaining <= 0) {
      setCanResend(true);
      return;
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining]);

  // Auto-close success screen after 3 seconds
  useEffect(() => {
    if (!success) return;

    const timer = setTimeout(() => {
      successOpacity.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      setTimeout(() => {
        onBack();
      }, 300);
    }, 3000);

    return () => clearTimeout(timer);
  }, [success, successOpacity, onBack]);

  // Animate progress bar smoothly from 0 to ~85% while loading
  useEffect(() => {
    if (loading) {
      progressValue.value = withTiming(0.85, {
        duration: 2500,
        easing: Easing.inOut(Easing.quad),
      });
    } else if (success) {
      // Complete the progress bar on success
      progressValue.value = withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progressValue.value = 0;
    }
  }, [loading, success, progressValue]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progressValue.value, [0, 1], [0, 100])}%`,
  }));

  const handleSendLink = async () => {
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await sendMagicLink(normalizedEmail);
      setSuccess(true);
      setTimeRemaining(60); // 60 seconds before resend
      setCanResend(false);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Could not send link. Please check your email and try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    handleSendLink();
  };

  const successStyle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
  }));

  if (success) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.secondary} />
        </Pressable>

        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={[styles.content, successStyle]}>
          {/* Success Icon with Animation */}
          <Animated.View entering={FadeIn.duration(600)} style={styles.successIconContainer}>
            <View style={[styles.successIconBg, { backgroundColor: theme.secondary + '20', borderColor: theme.secondary }]}>
              <Ionicons name="checkmark-circle" size={64} color={theme.secondary} />
            </View>
          </Animated.View>

          <Text style={[styles.title, { color: theme.text }]}>
            Check your email
          </Text>

          {/* Email Display Card */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(500)}
            style={[
              styles.emailCard,
              {
                backgroundColor: theme.secondary + '08',
                borderColor: theme.secondary + '30',
              },
            ]}
          >
            <Ionicons name="mail-outline" size={20} color={theme.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.emailLabel, { color: theme.textSecondary }]}>Sign-in link sent to</Text>
              <Text style={[styles.emailValue, { color: theme.text }]}>{email}</Text>
            </View>
          </Animated.View>

          {/* Steps */}
          <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.stepsContainer}>
            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: theme.secondary }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>1</Text>
              </View>
              <Text style={[styles.stepText, { color: theme.text }]}>
                Click the link in your email
              </Text>
            </View>

            <View style={[styles.stepConnector, { backgroundColor: theme.secondary + '30' }]} />

            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: theme.secondary }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>2</Text>
              </View>
              <Text style={[styles.stepText, { color: theme.text }]}>
                You'll be signed in immediately
              </Text>
            </View>
          </Animated.View>

          {/* Tips */}
          <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.tipsContainer}>
            <View style={styles.tip}>
              <Ionicons name="alert-circle" size={16} color={theme.textSecondary} />
              <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                Link expires in 24 hours
              </Text>
            </View>
            {Platform.OS !== 'web' && (
              <View style={[styles.tip, { backgroundColor: theme.secondary + '08', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }]}>
                <Ionicons name="phone-portrait-outline" size={16} color={theme.secondary} style={{ marginRight: 4 }} />
                <Text style={[styles.tipText, { color: theme.secondary, fontWeight: '600', flex: 1 }]}>
                  Tap the link in your email and we'll sign you in instantly
                </Text>
              </View>
            )}
            {Platform.OS === 'web' && (
              <View style={[styles.tip, { backgroundColor: theme.secondary + '08', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }]}>
                <Ionicons name="open-outline" size={16} color={theme.secondary} style={{ marginRight: 4 }} />
                <Text style={[styles.tipText, { color: theme.secondary, fontWeight: '600', flex: 1 }]}>
                  The link will open in this browser window
                </Text>
              </View>
            )}
            <View style={styles.tip}>
              <Ionicons name="shield-checkmark" size={16} color={theme.secondary} />
              <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                No password required
              </Text>
            </View>
          </Animated.View>

          {/* Closing Indicator */}
          <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.closingSection}>
            <Text style={[styles.closingText, { color: theme.textSecondary }]}>
              ✓ Closing in a moment...
            </Text>
          </Animated.View>

          {/* Resend Section (fallback) */}
          <Animated.View entering={FadeInDown.delay(600).duration(500)} style={styles.resendSection}>
            {!canResend && timeRemaining > 0 ? (
              <Text style={[styles.resendWait, { color: theme.textSecondary }]}>
                Resend available in {timeRemaining}s
              </Text>
            ) : (
              <Pressable onPress={handleResend} disabled={loading}>
                <Text style={[styles.resendLink, { color: theme.secondary, opacity: loading ? 0.5 : 1 }]}>
                  Didn't receive? Resend link
                </Text>
              </Pressable>
            )}
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Progress Bar */}
      {loading && (
        <Animated.View style={[styles.progressBar, { backgroundColor: theme.secondary + '20' }]}>
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: theme.secondary },
              progressStyle,
            ]}
          />
        </Animated.View>
      )}

      <Pressable onPress={onBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={theme.secondary} />
      </Pressable>

      <Animated.View entering={FadeIn.duration(400)} style={[styles.content, { maxWidth }]}>
        {/* Icon with Glow */}
        <View style={styles.iconContainer}>
          <View style={[styles.iconGlow, { backgroundColor: theme.secondary + '15' }]} />
          <Ionicons name="mail-unread-outline" size={48} color={theme.secondary} />
        </View>

        {/* Title & Subtitle */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.headerSection}>
          <Text style={[styles.title, { color: theme.text }]}>
            Passwordless login
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Enter your email and we'll send you a secure sign-in link
          </Text>
        </Animated.View>

        {/* Error Message */}
        {error && (
          <Animated.View entering={FadeIn.duration(300)} style={[styles.errorBanner, { backgroundColor: theme.error + '15', borderColor: theme.error }]}>
            <Ionicons name="alert-circle" size={18} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </Animated.View>
        )}

        {/* Input Section */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.inputSection}>
          <Text style={[styles.label, { color: theme.secondary }]}>Email address</Text>
          <View style={[styles.inputWrapper, { borderColor: error ? theme.error : theme.border }]}>
            <Ionicons name="mail-outline" size={20} color={theme.secondary} style={{ marginRight: 10 }} />
            <TextInput
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError(null);
              }}
              style={[
                styles.input,
                {
                  backgroundColor: 'transparent',
                  color: theme.text,
                },
              ]}
              placeholder="you@example.com"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              autoFocus
            />
          </View>
          {isValidEmail(email.trim()) && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.validationHint}>
              <Ionicons name="checkmark-circle" size={14} color={theme.secondary} />
              <Text style={[styles.validationText, { color: theme.secondary }]}>Valid email</Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* Info Box */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(400)}
          style={[
            styles.infoBox,
            {
              backgroundColor: theme.secondary + '08',
              borderColor: theme.secondary + '20',
            },
          ]}
        >
          <Ionicons name="information-circle" size={18} color={theme.secondary} />
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            We'll send a secure link to your email. No password needed.
          </Text>
        </Animated.View>

        {/* Send Button */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)} style={{ width: '100%' }}>
          <Pressable
            onPress={handleSendLink}
            disabled={loading || !email.trim() || !isValidEmail(email.trim())}
            style={[
              styles.button,
              { backgroundColor: theme.secondary },
              (loading || !email.trim() || !isValidEmail(email.trim())) && styles.buttonDisabled,
              isValidEmail(email.trim()) && !loading && { shadowColor: theme.secondary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={theme.primary} size="small" />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.buttonText, { color: theme.primary }]}>Send sign-in link</Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* Alternative Login Link */}
        <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.alternativeSection}>
          <Text style={[styles.alternativeText, { color: theme.textSecondary }]}>
            Prefer to use password?
          </Text>
          <Pressable onPress={onBack}>
            <Text style={[styles.alternativeLink, { color: theme.secondary }]}>Back to login</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    gap: 16,
    alignItems: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  iconGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    top: -26,
    left: -26,
  },
  headerSection: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
    width: '100%',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  inputSection: {
    width: '100%',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  validationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  validationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
    width: '100%',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 15,
  },
  alternativeSection: {
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  alternativeText: {
    fontSize: 13,
  },
  alternativeLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Success screen styles
  successIconContainer: {
    marginBottom: 16,
  },
  successIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    alignItems: 'center',
    width: '100%',
  },
  emailLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  emailValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  stepsContainer: {
    width: '100%',
    gap: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontWeight: '700',
    fontSize: 14,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 4,
  },
  stepConnector: {
    width: 2,
    height: 24,
    marginLeft: 15,
  },
  tipsContainer: {
    width: '100%',
    gap: 8,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  closingSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  closingText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  resendSection: {
    alignItems: 'center',
    marginVertical: 8,
  },
  resendWait: {
    fontSize: 12,
    fontWeight: '600',
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '700',
  },
});
