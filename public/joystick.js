class VirtualJoystick {
    constructor(zoneId) {
        this.zone = document.getElementById(zoneId);
        this.knob = null;
        
        this.dx = 0; // Normalized movement x (-1 to 1)
        this.dy = 0; // Normalized movement y (-1 to 1)
        this.active = false;
        
        this.touchId = null;
        this.startX = 0;
        this.startY = 0;
        this.maxRadius = 45; // Max knob drag radius

        this.init();
    }

    init() {
        if (!this.zone) return;

        // Create the inner knob element
        this.knob = document.createElement('div');
        this.knob.style.width = '45px';
        this.knob.style.height = '45px';
        this.knob.style.background = 'rgba(0, 255, 204, 0.4)';
        this.knob.style.border = '2px solid #00ffcc';
        this.knob.style.borderRadius = '50%';
        this.knob.style.position = 'absolute';
        this.knob.style.top = '50%';
        this.knob.style.left = '50%';
        this.knob.style.transform = 'translate(-50%, -50%)';
        this.knob.style.pointerEvents = 'none';
        this.knob.style.boxShadow = '0 0 10px rgba(0, 255, 204, 0.5)';
        this.knob.style.transition = 'background 0.1s, border-color 0.1s';
        
        this.zone.appendChild(this.knob);

        // Attach touch listeners
        this.zone.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        window.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        window.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
    }

    onTouchStart(e) {
        if (this.active) return;
        e.preventDefault();

        // Get the touch event inside the zone
        const rect = this.zone.getBoundingClientRect();
        const touch = e.changedTouches[0];
        
        this.touchId = touch.identifier;
        this.active = true;
        
        // Joystick center relative to screen
        this.startX = rect.left + rect.width / 2;
        this.startY = rect.top + rect.height / 2;

        this.knob.style.background = 'rgba(0, 255, 204, 0.7)';
        
        this.updatePosition(touch.clientX, touch.clientY);
    }

    onTouchMove(e) {
        if (!this.active) return;
        
        // Find the touch that started the joystick
        let activeTouch = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === this.touchId) {
                activeTouch = e.touches[i];
                break;
            }
        }

        if (activeTouch) {
            e.preventDefault();
            this.updatePosition(activeTouch.clientX, activeTouch.clientY);
        }
    }

    onTouchEnd(e) {
        if (!this.active) return;

        // Check if the tracking touch ended
        let touchEnded = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.touchId) {
                touchEnded = true;
                break;
            }
        }

        if (touchEnded) {
            this.active = false;
            this.touchId = null;
            this.dx = 0;
            this.dy = 0;
            
            // Reset knob to center
            this.knob.style.left = '50%';
            this.knob.style.top = '50%';
            this.knob.style.background = 'rgba(0, 255, 204, 0.4)';
        }
    }

    updatePosition(clientX, clientY) {
        let offsetX = clientX - this.startX;
        let offsetY = clientY - this.startY;
        
        const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        
        if (distance > this.maxRadius) {
            // Constrain knob within the circle boundary
            offsetX = (offsetX / distance) * this.maxRadius;
            offsetY = (offsetY / distance) * this.maxRadius;
        }

        // Display update
        // Shift from center (50%)
        this.knob.style.left = `calc(50% + ${offsetX}px)`;
        this.knob.style.top = `calc(50% + ${offsetY}px)`;

        // Set normalized inputs
        this.dx = offsetX / this.maxRadius;
        this.dy = offsetY / this.maxRadius;
    }
}
// Export class globally
window.VirtualJoystick = VirtualJoystick;
