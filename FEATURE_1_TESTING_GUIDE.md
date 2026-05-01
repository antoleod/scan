# Feature 1: Medication Workflow Testing Guide

## Quick Start

The medication workflow detection is now fully integrated. To test it:

1. **Open the Notes tab** in the app
2. **Type a medication-related note** such as:
   - Spanish: "tomé dafalgan 500mg para dolor de garganta"
   - English: "took ibuprofen 400mg for fever at 8am"
   - French: "pris amoxicilline pour infection"

3. **SmartWorkflowCard appears** (when ≥10 chars typed and ≥65% confidence)
4. **Click "Create followup"** → Medication modal opens
5. **Review pre-filled data** and adjust as needed
6. **Click "Create"** → Medication entry is saved

## Test Cases

### ✅ Test 1: OTC Pain Relief (Paracetamol/Dafalgan)
**Input**: "tomé dafalgan 500mg para dolor de garganta a las 8"

**Expected Behavior**:
- SmartWorkflowCard shows "Medication detected"
- Click "Create followup" opens modal
- Fields auto-filled:
  - Medication: "dafalgan" (recognized as Paracetamol)
  - Dose: "500mg"
  - Reason: "dolor de garganta" (sore throat)
  - Time: "08:00"
- Follow-up options: [in 4h, in 6h, in 8h] (Paracetamol 4h minimum interval)
- Safety notes appear (liver toxicity warning, etc.)
- No prescription warning (OTC)

### ✅ Test 2: Antibiotic (Amoxicillin) - Prescription-Only
**Input**: "amoxicillin 500mg for throat infection"

**Expected Behavior**:
- SmartWorkflowCard shows "Medication detected"
- Click "Create followup" opens modal
- Medication auto-detected: "amoxicillin"
- **RED ALERT**: "Prescription-only medication. Follow doctor instructions exactly."
- No dose/interval pre-fill (user must enter per prescription)
- Safety notes emphasize: "Complete the full course"
- Form shows prescription warning prominently

### ✅ Test 3: Anti-inflammatory (Ibuprofen)
**Input**: "ibuprofen for stomach pain and fever"

**Expected Behavior**:
- Detected as Ibuprofen
- **ORANGE WARNING**: "Your note mentions symptoms that need immediate medical attention. Please consult a healthcare professional."
- Reason shows: "stomach pain" (red flag detected)
- Follow-up options: [in 6h, in 8h] (Ibuprofen 6h minimum interval)
- Safety notes highlight stomach concerns

### ✅ Test 4: Antihistamine (Cetirizine)
**Input**: "took cetirizine 10mg for allergy"

**Expected Behavior**:
- Detected as Cetirizine
- Follow-up options: [tomorrow] (24h interval, once daily)
- Dose pre-filled: "10mg"
- Safety notes: "May cause drowsiness"

### ✅ Test 5: Stomach Medication (Omeprazole)
**Input**: "omeprazole 20mg before breakfast"

**Expected Behavior**:
- Detected as Omeprazole
- Dose: "20mg" auto-filled
- Follow-up: [tomorrow] (daily medication)
- Safety note: "Best taken 30 min before meals"

### ❌ Test 6: No Medication Detected
**Input**: "I'm feeling better today"

**Expected Behavior**:
- No SmartWorkflowCard appears (no medication keywords)
- Note can be saved normally without workflow

## Feature Details

### Dose Extraction Patterns
- "400mg" ✓
- "400 mg" ✓
- "1 tablet" ✓
- "2 comprimidos" ✓
- "5 ml" ✓

### Time Extraction Patterns
- "8am" ✓
- "08:00" ✓
- "20h" ✓
- "a las 8" ✓ (Spanish)
- "à 20h" ✓ (French)

### Supported Languages
- English: "fever", "pain", "throat"
- Spanish: "fiebre", "dolor", "garganta"
- French: "fièvre", "douleur", "gorge"
- Dutch: Full support via aliases

### Confidence Factors
- Base confidence for alias match: 50%
- +15% for dose detection
- +10% for time detection
- +10% for reason detection
- +8% per confidence keyword (max 15%)
- Min 65% required to show SmartWorkflowCard

## Implementation Details

### Medication Profile Structure
Each medication in `src/data/medications.common.json` includes:
- **id**: Unique identifier (e.g., "paracetamol")
- **displayName**: User-friendly name
- **aliases**: All possible names/brands (multilingual)
- **allowAutoPrefill**: OTC vs Rx determination
- **safetyNotes**: Non-prescriptive safety info
- **redFlags**: Serious symptoms requiring immediate care
- **usualFollowUpOptionsHours**: Medication-specific intervals
- **requiresDoctor**: Boolean for Rx-only medications

### Exported Functions
```typescript
detectMedicationFromText(text: string): MedicationDetectionResult | null
buildMedicationFollowUp(detection, overrides?): MedicationFollowUpDraft
getMedicationById(id: string): MedicationProfile | null
getAllMedications(): MedicationProfile[]
```

## Safety Guardrails

✓ **Non-prescriptive**: Never tells user to take specific dose
✓ **Verification-focused**: Always recommends checking leaflet/pharmacist
✓ **Red flag detection**: Highlights concerning symptoms
✓ **Rx distinction**: Clear visual for prescription-only drugs
✓ **Medical disclaimer**: Always visible in modal footer

## Known Limitations

- Dose/time extraction is heuristic-based (good for common patterns, may miss unusual formats)
- Language detection is approximate (looks for language-specific prepositions)
- Cannot detect drug interactions (would require comprehensive drug database)
- Red flags are predefined (cannot detect arbitrary symptoms)

## Troubleshooting

**Q: SmartWorkflowCard doesn't appear when I type medication name**
- A: Check text is ≥10 characters
- A: Confidence must be ≥65% (try adding dose or reason)
- A: Verify medication is in the supported list

**Q: Fields not pre-filling in modal**
- A: Ensure medication name is recognized (check aliases in JSON)
- A: Try more explicit format: "took dafalgan 500mg for pain"

**Q: Prescription warning not showing for Rx-only drug**
- A: Check `requiresDoctor: true` in medication profile
- A: Modal should show red alert before form

## Next Testing Steps

After Feature 1 validation, proceed to:
- **Feature 2**: Duplicate note detection with renewal workflow
- **Feature 3**: Calendar organization with workflow-based filtering
