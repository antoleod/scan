import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { mainAppStyles } from './styles';

type Feedback = {
  type: 'success' | 'duplicate' | 'error';
  message: string;
} | null;

export function ScanFeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;

  return (
    <View
      style={[
        mainAppStyles.scanNotice,
        feedback.type === 'success'
          ? mainAppStyles.scanNoticeSuccess
          : feedback.type === 'duplicate'
            ? mainAppStyles.scanNoticeDuplicate
            : mainAppStyles.scanNoticeError,
      ]}
    >
      <Ionicons
        name={
          feedback.type === 'success'
            ? 'checkmark-circle-outline'
            : feedback.type === 'duplicate'
              ? 'alert-circle-outline'
              : 'close-circle-outline'
        }
        size={18}
        color="#fff"
      />
      <Text style={mainAppStyles.scanNoticeText}>{feedback.message}</Text>
    </View>
  );
}
