package studio.ksprateek.greenovators.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RequestMapping("/api/health")
@RestController
public class HealthController {
    @GetMapping
    public ResponseEntity<?> checkHealth(){
        return ResponseEntity.ok("Healthy");
    }
}
