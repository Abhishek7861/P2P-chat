package com.example.p2p.config;

import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.webmvc.error.DefaultErrorAttributes;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.stereotype.Component;
import org.springframework.validation.FieldError;
import org.springframework.web.context.request.WebRequest;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Keeps internal details out of error responses; they stay in the server log.
 * 5xx responses lose their message (it can contain SQL). Validation errors are cut down to
 * the field and its message, because the defaults echo rejected values such as passwords.
 */
@Component
public class SafeErrorAttributes extends DefaultErrorAttributes {
    @Override
    public Map<String, Object> getErrorAttributes(WebRequest request, ErrorAttributeOptions options) {
        Map<String, Object> attributes = super.getErrorAttributes(request, options);
        if (attributes.get("status") instanceof Integer status && status >= 500) {
            attributes.remove("message");
            attributes.remove("errors");
        } else if (attributes.get("errors") instanceof List<?> errors) {
            attributes.put("message", "Validation failed");
            attributes.put("errors", errors.stream().map(SafeErrorAttributes::summarize).toList());
        }
        return attributes;
    }

    private static Map<String, Object> summarize(Object error) {
        Map<String, Object> summary = new LinkedHashMap<>();
        if (error instanceof FieldError fieldError) summary.put("field", fieldError.getField());
        if (error instanceof MessageSourceResolvable resolvable) summary.put("defaultMessage", resolvable.getDefaultMessage());
        return summary;
    }
}
