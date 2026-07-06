// Validation Utility - Server-side validation for all inputs

const validators = {
  // Validate email format
  email: (value) => {
    if (!value) return { valid: false, error: 'Email is required' };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return { valid: false, error: 'Invalid email format' };
    }
    return { valid: true };
  },

  // Validate phone number (10-15 digits)
  phone: (value) => {
    if (!value) return { valid: false, error: 'Phone number is required' };
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!phoneRegex.test(value.replace(/[-\s]/g, ''))) {
      return { valid: false, error: 'Invalid phone number format' };
    }
    return { valid: true };
  },

  // Validate GST number (Indian format)
  gst: (value) => {
    if (!value) return { valid: true }; // Optional field
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(value)) {
      return { valid: false, error: 'Invalid GST number format' };
    }
    return { valid: true };
  },

  // Validate text (non-empty, max length)
  text: (value, maxLength = 255) => {
    if (!value || value.trim() === '') {
      return { valid: false, error: 'This field is required' };
    }
    if (value.length > maxLength) {
      return { valid: false, error: `Maximum ${maxLength} characters allowed` };
    }
    return { valid: true };
  },

  // Validate number (positive, in range)
  number: (value, min = 0, max = Infinity) => {
    if (value === null || value === undefined || value === '') {
      return { valid: false, error: 'This field is required' };
    }
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, error: 'Must be a valid number' };
    }
    if (num < min) {
      return { valid: false, error: `Minimum value is ${min}` };
    }
    if (num > max) {
      return { valid: false, error: `Maximum value is ${max}` };
    }
    return { valid: true };
  },

  // Validate date
  date: (value) => {
    if (!value) return { valid: false, error: 'Date is required' };
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }
    return { valid: true };
  },

  // Validate currency (positive decimal)
  currency: (value) => {
    if (value === null || value === undefined || value === '') {
      return { valid: false, error: 'This field is required' };
    }
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      return { valid: false, error: 'Must be a valid amount' };
    }
    return { valid: true };
  }
};

// Batch validation function
function validateData(data, rules) {
  const errors = {};
  
  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];
    
    if (typeof rule === 'function') {
      const result = rule(value);
      if (!result.valid) {
        errors[field] = result.error;
      }
    } else if (typeof rule === 'object') {
      const validator = validators[rule.type];
      if (validator) {
        const result = validator(value, rule.max || rule.min);
        if (!result.valid) {
          errors[field] = result.error;
        }
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

module.exports = { validators, validateData };
