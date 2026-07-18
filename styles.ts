import { StyleSheet, Platform } from 'react-native';

export const COLORS = {
  // Backgrounds
  background: '#FFFFFF',
  cardBackground: '#F7F9F6',
  inputBackground: '#F0F3F0',
  
  // Brand Colors
  primaryGreen: '#3B964E',
  primaryGreenDark: '#286635',
  lightGreenBg: '#EBF5ED',
  
  // Neutral Colors
  textPrimary: '#1E221F',
  textSecondary: '#606A62',
  textMuted: '#8C968E',
  border: '#E6EAE5',
  borderDark: '#D1D7CE',
  
  // Semantic/Score Colors
  scoreGreen: '#3B964E',
  scoreGreenLight: '#E8F5E9',
  scoreYellow: '#D97706',
  scoreYellowLight: '#FEF3C7',
  scoreRed: '#DC2626',
  scoreRedLight: '#FEE2E2',
  
  // Miscellaneous
  shadowColor: '#0F1D11',
  white: '#FFFFFF',
  
  // System Colors (iOS-like defaults)
  systemBlue: '#007AFF',
  systemOrange: '#FF9500',
  systemRed: '#FF3B30',
  systemPink: '#FF2D55',
  systemPurple: '#AF52DE',
  systemIndigo: '#5856D6',
  systemTeal: '#00C7BE',
  systemGreen: '#34C759',
  systemGray: '#8E8E93',
  systemGrayLight: '#EFEFF4',
  systemGray2: '#C6C6C8',
  
  // Macro Colors
  macroCarbs: '#FF9500',
  macroSugars: '#FFCC00',
  macroFat: '#FF2D55',
  macroSatFat: '#FF9F0A',
  macroProtein: '#32ADE6',
  macroFiber: '#34C759',
  macroSalt: '#8E8E93',
};

export const globalStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100, // padding to clear bottom tab bar
    paddingTop: 10,
  },
  
  // Card base styles
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadowColor,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      default: {
        boxShadow: '0px 6px 12px rgba(15, 29, 17, 0.04)',
      }
    }),
  },
  
  // Badges & Pills
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  
  // Typography
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginVertical: 14,
  },
  bodyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  
  // Row utility
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  // Buttons
  primaryButton: {
    backgroundColor: COLORS.primaryGreen,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 12,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: COLORS.cardBackground,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
